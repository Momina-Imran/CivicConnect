pipeline {
    agent any

    triggers { githubPush() }

    stages {
        stage('Checkout from GitHub') {
            steps {
                git branch: 'main', url: 'https://github.com/Momina-Imran/CivicConnect.git'
            }
        }

        stage('Pull images (Docker Pipeline)') {
            steps {
                script {
                    docker.image('node:20-alpine').pull()
                    docker.image('mysql:8.0').pull()
                }
            }
        }

        stage('Build & Deploy') {
            steps {
                sh 'docker compose -p ci -f docker-compose.jenkins.yml up -d --force-recreate'
            }
        }

        stage('Verify') {
            steps {
                sh '''
                  for i in $(seq 1 30); do
                    if curl -sf http://localhost:8001/api/health; then echo; echo "App is UP"; exit 0; fi
                    echo "waiting for app... ($i/30)"; sleep 5
                  done
                  echo "App did not come up"; docker logs ci_civic_web --tail 50; exit 1
                '''
            }
        }
    }

    post {
        always {
            emailext(
                subject: "Jenkins build ${currentBuild.currentResult}: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """Build result: ${currentBuild.currentResult}
Job: ${env.JOB_NAME} #${env.BUILD_NUMBER}
Console log: ${env.BUILD_URL}console
App URL: http://54.79.32.255:8001""",
                recipientProviders: [developers(), requestor(), culprits()]
            )
        }
    }
}
