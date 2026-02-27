-- Add maintenance note on API endpoint control
ALTER TABLE `ApiEndpoint`
    ADD COLUMN `maintenanceNote` TEXT NULL;

-- Manual billing invoices
CREATE TABLE `BillingInvoice` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `plan` ENUM('FREE', 'PAID', 'RESELLER') NOT NULL,
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
    `status` ENUM('UNPAID', 'PAID', 'EXPIRED', 'CANCELED') NOT NULL DEFAULT 'UNPAID',
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `paymentProofUrl` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `BillingInvoice_userId_status_createdAt_idx`(`userId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- User subscription states and period
CREATE TABLE `UserSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `plan` ENUM('FREE', 'PAID', 'RESELLER') NOT NULL,
    `status` ENUM('ACTIVE', 'EXPIRED', 'CANCELED') NOT NULL DEFAULT 'ACTIVE',
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NULL,
    `autoDowngradeTo` ENUM('FREE', 'PAID', 'RESELLER') NOT NULL DEFAULT 'FREE',
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `UserSubscription_userId_status_endAt_idx`(`userId`, `status`, `endAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Runtime system settings
CREATE TABLE `SystemSetting` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `valueJson` JSON NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `SystemSetting_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Admin audit trail
CREATE TABLE `AdminAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `beforeJson` JSON NULL,
    `afterJson` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `AdminAuditLog_actorUserId_action_createdAt_idx`(`actorUserId`, `action`, `createdAt`),
    INDEX `AdminAuditLog_targetType_targetId_createdAt_idx`(`targetType`, `targetId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BillingInvoice`
    ADD CONSTRAINT `BillingInvoice_userId_fkey`
        FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `BillingInvoice_approvedById_fkey`
        FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `UserSubscription`
    ADD CONSTRAINT `UserSubscription_userId_fkey`
        FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `UserSubscription_updatedById_fkey`
        FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `SystemSetting`
    ADD CONSTRAINT `SystemSetting_updatedById_fkey`
        FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AdminAuditLog`
    ADD CONSTRAINT `AdminAuditLog_actorUserId_fkey`
        FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE;
