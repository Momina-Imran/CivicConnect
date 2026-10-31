# CivicConnect – Deployment Guide (MySQL)

App = Node.js/Express + MySQL. Express serves the frontend (`public/`) and the API (`/api/*`) from one URL.
Tables are created automatically on first start (`schema.sql` is there for reference).

Environment variables (see `.env.example`): `PORT, JWT_SECRET, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME`
(on Elastic Beanstalk the `RDS_*` variables are also understood).

---------------------------------------------------------------
## PART I – EC2 (IaaS)

1. **Launch instance**: EC2 > Launch instance > Ubuntu 22.04/24.04, t2.micro/t3.micro, create a key pair (`.pem`).
2. **Security group inbound rules**

   | Port | Source    | Why                          |
   |------|-----------|------------------------------|
   | 22   | My IP     | SSH                          |
   | 80   | 0.0.0.0/0 | HTTP                         |
   | 3306 | 0.0.0.0/0 | grader's read-only DB access |

3. **Connect**: `ssh -i key.pem ubuntu@<EC2-PUBLIC-IP>`
4. **Install packages**
   ```bash
   sudo apt update && sudo apt install -y mysql-server unzip
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo npm install -g pm2
   ```
5. **MySQL setup** (`sudo mysql`):
   ```sql
   CREATE DATABASE civicconnect;
   CREATE USER 'civic_app'@'localhost' IDENTIFIED BY 'StrongPass#2026';
   GRANT ALL ON civicconnect.* TO 'civic_app'@'localhost';
   CREATE USER 'grader_ro'@'%' IDENTIFIED BY 'ReadOnly#2026';
   GRANT SELECT ON civicconnect.* TO 'grader_ro'@'%';
   FLUSH PRIVILEGES;
   ```
   Allow remote connections:
   `sudo sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf && sudo systemctl restart mysql`
6. **Upload code** (from your PC): `scp -i key.pem civicconnect.zip ubuntu@<IP>:~`
   then on the server: `unzip civicconnect.zip -d civicconnect && cd civicconnect`
7. **Configure & start**
   ```bash
   cp .env.example .env && nano .env      # DB_USER=civic_app, DB_PASSWORD=..., JWT_SECRET=<random>
   npm install --omit=dev
   pm2 start server.js --name civicconnect
   pm2 startup        # run the command it prints
   pm2 save
   sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000
   ```
8. **Check**: `http://<EC2-PUBLIC-IP>/api/health` should show `"database":"connected"`, then open `http://<EC2-PUBLIC-IP>/`.

DB details for the form (Part I): host = EC2 public IP, port 3306, db `civicconnect`, user `grader_ro`.
> Use an Elastic IP if you stop/start the instance, otherwise the public IP changes.

---------------------------------------------------------------
## PART II – S3 + Elastic Beanstalk + RDS (PaaS)

1. **RDS** (create it first, separately, so the grader can reach it):
   RDS > Create database > Standard create > MySQL > Free tier template >
   identifier `civicconnect-db`, master user `admin`, set a password, **Public access = Yes**,
   security group inbound: MySQL/Aurora 3306 from 0.0.0.0/0.
   Initial database name: `civicconnect`.
2. **Read-only user** (from your EC2 instance: `sudo apt install -y mysql-client`):
   ```bash
   mysql -h <RDS-ENDPOINT> -u admin -p
   ```
   ```sql
   CREATE DATABASE IF NOT EXISTS civicconnect;
   CREATE USER 'grader_ro'@'%' IDENTIFIED BY 'ReadOnly#2026';
   GRANT SELECT ON civicconnect.* TO 'grader_ro'@'%';
   FLUSH PRIVILEGES;
   ```
   (The app creates the tables itself when it first starts.)
3. **Build the bundle** – zip the *contents* of the project (not the parent folder), **without** `node_modules` and `.env`:
   `zip -r civicconnect-eb.zip . -x "node_modules/*" ".env"`
4. **S3**: create a bucket (e.g. `civicconnect-code-<yourname>`) and upload `civicconnect-eb.zip`.
5. **Elastic Beanstalk**: Create application `civicconnect` > Web server environment >
   Platform **Node.js** (Amazon Linux 2023) > Application code: *Upload your code* (upload the zip;
   EB keeps the version in its own S3 bucket – screenshot it for the report) > Preset: Single instance.
   Service role `aws-elasticbeanstalk-service-role`, instance profile `aws-elasticbeanstalk-ec2-role`
   (create them if the console asks).
6. **Environment properties** (Configuration > Updates, monitoring and logging > Environment properties):
   `DB_HOST=<RDS-ENDPOINT>`, `DB_PORT=3306`, `DB_USER=admin`, `DB_PASSWORD=<pw>`, `DB_NAME=civicconnect`, `JWT_SECRET=<random>`
   (do **not** set PORT; EB sets it).
7. **Check**: open the environment URL, then `<URL>/api/health`.

DB details for the form (Part II): host = RDS endpoint, port 3306, db `civicconnect`, user `grader_ro`.

Notes
- Uploaded complaint images are stored on the instance disk and are lost when EB replaces the instance (fine for the assignment).
- Delete/stop resources after grading to avoid charges (EB environment, RDS, EC2).

---------------------------------------------------------------
## Report checklist (screenshots)
EC2 launch, security group, key pair, SSH session, installs, MySQL users, app running (pm2), browser pages,
RDS creation, S3 bucket with the zip, EB environment (health green), environment properties, browser pages on EB,
final URLs for both parts.
