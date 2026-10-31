-- Optional: the app creates these tables automatically on startup.
CREATE DATABASE IF NOT EXISTS civicconnect;
USE civicconnect;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ngos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  sector VARCHAR(60) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS complaints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  ngo_id INT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  contact VARCHAR(30) NOT NULL,
  department VARCHAR(60) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  ngo_name VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  attachment VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (ngo_id) REFERENCES ngos(id) ON DELETE SET NULL
);

-- Read-only account for the assignment's evaluation script
-- (replace the password; use '%' so it can connect remotely)
-- CREATE USER 'grader_ro'@'%' IDENTIFIED BY 'ReadOnly#2026';
-- GRANT SELECT ON civicconnect.* TO 'grader_ro'@'%';
-- FLUSH PRIVILEGES;
