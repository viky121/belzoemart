-- The Super Admin staff type is protected: it cannot be edited, renamed or deleted from the admin panel.
ALTER TABLE "roles" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
UPDATE "roles" SET "isSystem" = true WHERE "name" = 'super_admin';
