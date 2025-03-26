const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('./utils/logger');
const backup = require('./utils/backup');

class Scheduler {
    constructor() {
        // Run incremental update at 2 AM daily
        this.dailyUpdateJob = cron.schedule('0 2 * * *', () => {
            this.runIncrementalUpdate();
        });

        // Run full update and validation at 3 AM on Sundays
        this.weeklyValidationJob = cron.schedule('0 3 * * 0', () => {
            this.runFullUpdate();
        });

        // Run backup at 4 AM daily
        this.backupJob = cron.schedule('0 4 * * *', () => {
            this.runBackup();
        });
    }

    async runIncrementalUpdate() {
        logger.info('Starting incremental update');
        try {
            const result = await this.spawnProcess('fetch:increment');
            logger.info('Incremental update completed', { result });
        } catch (error) {
            logger.error('Incremental update failed', error);
        }
    }

    async runFullUpdate() {
        logger.info('Starting full update');
        try {
            const result = await this.spawnProcess('fetch:full');
            logger.info('Full update completed', { result });
        } catch (error) {
            logger.error('Full update failed', error);
        }
    }

    async runBackup() {
        logger.info('Starting backup');
        try {
            await backup.backup();
            logger.info('Backup completed');
        } catch (error) {
            logger.error('Backup failed', error);
        }
    }

    spawnProcess(script) {
        return new Promise((resolve, reject) => {
            const child = spawn('npm', ['run', script], {
                cwd: path.join(__dirname, '..'),
                stdio: 'pipe'
            });

            let output = '';

            child.stdout.on('data', (data) => {
                output += data;
                logger.debug(data.toString());
            });

            child.stderr.on('data', (data) => {
                logger.error(data.toString());
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`Process exited with code ${code}`));
                }
            });
        });
    }

    start() {
        this.dailyUpdateJob.start();
        this.weeklyValidationJob.start();
        this.backupJob.start();
        logger.info('Scheduler started');
    }

    stop() {
        this.dailyUpdateJob.stop();
        this.weeklyValidationJob.stop();
        this.backupJob.stop();
        logger.info('Scheduler stopped');
    }
}

module.exports = new Scheduler(); 