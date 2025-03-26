const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
const logger = require('./logger');

class BackupService {
    constructor() {
        this.backupDir = path.join(__dirname, '../../backups');
    }

    async backup() {
        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const backupPath = path.join(this.backupDir, timestamp);
        
        try {
            // Create backup directory
            await fs.mkdir(backupPath, { recursive: true });
            
            // Backup data files
            const dataDir = path.join(__dirname, '../../data');
            const files = await fs.readdir(dataDir);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const sourcePath = path.join(dataDir, file);
                    const destPath = path.join(backupPath, file);
                    await fs.copyFile(sourcePath, destPath);
                }
            }
            
            logger.info(`Backup completed: ${backupPath}`);
            
            // Clean up old backups (keep last 7 days)
            await this.cleanOldBackups();
        } catch (error) {
            logger.error('Backup failed:', error);
            throw error;
        }
    }

    async cleanOldBackups() {
        const backups = await fs.readdir(this.backupDir);
        const oldDate = moment().subtract(7, 'days');
        
        for (const backup of backups) {
            const backupDate = moment(backup.split('_')[0], 'YYYYMMDD');
            if (backupDate.isBefore(oldDate)) {
                await fs.rmdir(path.join(this.backupDir, backup), { recursive: true });
                logger.info(`Cleaning up old backup: ${backup}`);
            }
        }
    }
}

module.exports = new BackupService(); 