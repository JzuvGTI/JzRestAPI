-- AlterTable
ALTER TABLE `User`
    ADD COLUMN `role` ENUM('USER', 'SUPERADMIN') NOT NULL DEFAULT 'USER',
    ADD COLUMN `isBlocked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `blockedAt` DATETIME(3) NULL,
    ADD COLUMN `banUntil` DATETIME(3) NULL,
    ADD COLUMN `banReason` VARCHAR(191) NULL,
    ADD COLUMN `referralCode` VARCHAR(191) NULL,
    ADD COLUMN `referredById` VARCHAR(191) NULL,
    ADD COLUMN `referralBonusDaily` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `referralCount` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX `User_referralCode_key` ON `User`(`referralCode`);

-- CreateIndex
CREATE INDEX `User_referredById_idx` ON `User`(`referredById`);

-- CreateTable
CREATE TABLE `ApiEndpoint` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `sampleQuery` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'NON_ACTIVE', 'MAINTENANCE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ApiEndpoint_slug_key`(`slug`),
    UNIQUE INDEX `ApiEndpoint_path_key`(`path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User`
    ADD CONSTRAINT `User_referredById_fkey`
    FOREIGN KEY (`referredById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
