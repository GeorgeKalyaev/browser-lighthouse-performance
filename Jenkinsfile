/**
 * Browser Performance Runner — Jenkins pulls this Jenkinsfile + URL profiles from Git SCM.
 *
 * Flow:
 *   1) Jenkins checks out the repo (Gitea locally / GitLab in company)
 *   2) Runs Playwright image with --volumes-from Jenkins (workspace has profiles from Git)
 *   3) Writes metrics to InfluxDB; Grafana dashboard reads browser_performance
 */
pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 4, unit: 'HOURS')
  }

  environment {
    PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.62.1-jammy'
    JENKINS_CONTAINER_NAME = "${env.JENKINS_CONTAINER_NAME ?: 'browser-performance-runner-jenkins-1'}"
  }

  stages {
    stage('Show checkout') {
      steps {
        sh 'pwd && ls -la && ls -la profiles || true'
      }
    }

    stage('Resolve RUN_ID') {
      steps {
        script {
          def runId = params.RUN_ID?.trim()
          if (!runId) {
            runId = "jenkins-${env.BUILD_NUMBER}-${new Date().format('yyyyMMdd-HHmmss')}"
          }
          env.EFFECTIVE_RUN_ID = runId
          echo "RUN_ID=${env.EFFECTIVE_RUN_ID}"
          echo "WORKSPACE=${env.WORKSPACE}"
        }
      }
    }

    stage('Browser Performance') {
      steps {
        withCredentials([
          string(credentialsId: 'USER_TOKEN', variable: 'USER_TOKEN'),
          string(credentialsId: 'ADMIN_TOKEN', variable: 'ADMIN_TOKEN'),
          string(credentialsId: 'INFLUX_USERNAME', variable: 'INFLUX_USERNAME'),
          string(credentialsId: 'INFLUX_PASSWORD', variable: 'INFLUX_PASSWORD')
        ]) {
          script {
            def influxEnabled = params.INFLUX_ENABLED ? 'true' : 'false'
            def npmScript = params.CHECK_ONLY ? 'browser:performance:check' : 'browser:performance'

            // Workspace is inside Jenkins home volume; Playwright container mounts it via --volumes-from.
            sh """
              set -eu
              docker pull '${PLAYWRIGHT_IMAGE}'
              docker run --rm \\
                --add-host=host.docker.internal:host-gateway \\
                --volumes-from '${JENKINS_CONTAINER_NAME}' \\
                -w '${env.WORKSPACE}' \\
                -e TEST_STAND='${params.TEST_STAND}' \\
                -e PERFORMANCE_URLS_PROFILE='${params.PERFORMANCE_URLS_PROFILE}' \\
                -e RUN_TIME='${params.RUN_TIME}' \\
                -e PACING='${params.PACING}' \\
                -e PERF_REQUEST_TIMEOUT='${params.PERF_REQUEST_TIMEOUT}' \\
                -e CACHE_MODE='${params.CACHE_MODE}' \\
                -e RUN_ID='${env.EFFECTIVE_RUN_ID}' \\
                -e INFLUX_ENABLED='${influxEnabled}' \\
                -e INFLUX_URL='${params.INFLUX_URL}' \\
                -e INFLUX_DATABASE='${params.INFLUX_DATABASE}' \\
                -e INFLUX_MEASUREMENT='${params.INFLUX_MEASUREMENT}' \\
                -e INFLUX_USERNAME \\
                -e INFLUX_PASSWORD \\
                -e USER_TOKEN \\
                -e ADMIN_TOKEN \\
                -e AUTH_STRATEGY='bearer-header' \\
                '${PLAYWRIGHT_IMAGE}' \\
                bash -lc 'npm ci && npm run ${npmScript}'
            """
          }
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'results/**/*', allowEmptyArchive: true
      echo "Finished RUN_ID=${env.EFFECTIVE_RUN_ID}"
      echo "Grafana: http://localhost:3000/d/browser-performance-lighthouse"
    }
  }
}
