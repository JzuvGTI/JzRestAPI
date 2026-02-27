-- Add profile avatar path support.
ALTER TABLE `User`
ADD COLUMN `avatarUrl` VARCHAR(191) NULL;
