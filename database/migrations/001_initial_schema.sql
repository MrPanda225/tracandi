-- =====================================================================
-- 001_initial_schema.sql — JobPilot, MySQL 8.4 LTS (compatible 8.0.16+)
-- Source de vérité du modèle physique. Ne jamais modifier une migration
-- déjà appliquée : créer 002_xxx.sql.
-- Conventions : InnoDB, utf8mb4_0900_ai_ci, DATETIME(3) en UTC,
-- noms en snake_case, PK `id` INT UNSIGNED, FK explicites et nommées.
-- =====================================================================

CREATE TABLE settings (
  setting_key   VARCHAR(64)  NOT NULL,
  setting_value JSON         NOT NULL,
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Paramètres et état applicatif (jeton OAuth chiffré, curseur de synchro)';

CREATE TABLE companies (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(160) NOT NULL,
  name_key    VARCHAR(160) NOT NULL COMMENT 'Clé normalisée RG-14, calculée par l''application',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_companies_name_key (name_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE watched_sites (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_name     VARCHAR(160) NOT NULL,
  adapter          ENUM('greenhouse','lever','smartrecruiters','recruitee','workday','generic') NOT NULL,
  identifier       VARCHAR(500) NOT NULL COMMENT 'Slug ATS ou URL https (RG-08)',
  identifier_hash  BINARY(32)   AS (UNHEX(SHA2(identifier, 256))) STORED COMMENT 'Unicité sur URL longue',
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  last_checked_at  DATETIME(3)  NULL,
  last_error       VARCHAR(500) NULL,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_watched_sites_source (adapter, identifier_hash),
  KEY ix_watched_sites_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE job_offers (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id           INT UNSIGNED NOT NULL,
  external_id       VARCHAR(255) NOT NULL,
  title             VARCHAR(300) NOT NULL,
  location          VARCHAR(200) NULL,
  contract          VARCHAR(100) NULL,
  url               VARCHAR(1000) NOT NULL,
  description       TEXT         NULL,
  posted_at         DATETIME(3)  NULL,
  first_seen_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  relevance_score   TINYINT UNSIGNED NULL,
  relevance_reason  VARCHAR(500) NULL,
  matched_target    VARCHAR(120) NULL,
  status            ENUM('new','saved','dismissed','applied') NOT NULL DEFAULT 'new',
  PRIMARY KEY (id),
  UNIQUE KEY uq_job_offers_source_item (site_id, external_id),
  KEY ix_job_offers_status_score (status, relevance_score),
  KEY ix_job_offers_first_seen (first_seen_at),
  CONSTRAINT fk_job_offers_site FOREIGN KEY (site_id) REFERENCES watched_sites (id) ON DELETE CASCADE,
  CONSTRAINT ck_job_offers_score CHECK (relevance_score IS NULL OR relevance_score <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE cv_versions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  offer_id    INT UNSIGNED NULL,
  label       VARCHAR(300) NOT NULL,
  content     JSON         NOT NULL COMMENT 'Contenu validé par CvContentSchema',
  file_stem   CHAR(36)     NOT NULL COMMENT 'UUID généré par le serveur (ENF-SEC-13)',
  provider    ENUM('claude','gemini') NULL COMMENT 'NULL = CV générique sans IA',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cv_versions_file_stem (file_stem),
  KEY ix_cv_versions_created (created_at),
  CONSTRAINT fk_cv_versions_offer FOREIGN KEY (offer_id) REFERENCES job_offers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE applications (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id        INT UNSIGNED NOT NULL,
  job_title         VARCHAR(300) NOT NULL DEFAULT 'Candidature',
  job_title_key     VARCHAR(300) NOT NULL COMMENT 'Clé normalisée RG-14 de job_title',
  status            ENUM('to_apply','sent','acknowledged','interview','offer','rejected') NOT NULL DEFAULT 'sent' COMMENT 'RG-01',
  source            ENUM('email','offer','manual') NOT NULL DEFAULT 'email',
  via_platform      VARCHAR(120) NULL COMMENT 'Plateforme intermédiaire (APEC, LHH...)',
  offer_id          INT UNSIGNED NULL,
  cv_version_id     INT UNSIGNED NULL,
  notes             VARCHAR(2000) NULL COMMENT 'EF-CAN-08',
  applied_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_activity_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_applications_company_title (company_id, job_title_key),
  KEY ix_applications_status_activity (status, last_activity_at) COMMENT 'Relances RG-06',
  KEY ix_applications_applied (applied_at) COMMENT 'Histogramme hebdo EF-TDB-04',
  KEY ix_applications_company_activity (company_id, last_activity_at) COMMENT 'Rattachement RG-03 (c)',
  CONSTRAINT fk_applications_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_applications_offer   FOREIGN KEY (offer_id) REFERENCES job_offers (id) ON DELETE SET NULL,
  CONSTRAINT fk_applications_cv      FOREIGN KEY (cv_version_id) REFERENCES cv_versions (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE emails (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  gmail_message_id  VARCHAR(64)  NOT NULL,
  gmail_thread_id   VARCHAR(64)  NOT NULL,
  application_id    INT UNSIGNED NULL,
  direction         ENUM('inbound','outbound') NOT NULL,
  from_address      VARCHAR(320) NULL,
  subject           VARCHAR(500) NULL,
  snippet           VARCHAR(300) NULL COMMENT 'ENF-RGP-01 : jamais le corps complet',
  category          ENUM('sent_application','acknowledged','interview','offer','rejected','job_alert') NOT NULL,
  via_platform      VARCHAR(120) NULL,
  received_at       DATETIME(3)  NOT NULL,
  classified_by     ENUM('claude','gemini','manual') NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_emails_gmail_message (gmail_message_id) COMMENT 'Idempotence EF-GML-06',
  KEY ix_emails_application_received (application_id, received_at) COMMENT 'Chronologie EF-CAN-04',
  KEY ix_emails_thread (gmail_thread_id),
  CONSTRAINT fk_emails_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE job_runs (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  job          ENUM('gmail_sync','scraper','backup') NOT NULL,
  trigger_type ENUM('schedule','manual') NOT NULL,
  started_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at  DATETIME(3)  NULL,
  outcome      ENUM('running','success','failure','skipped') NOT NULL DEFAULT 'running',
  stats        JSON         NULL,
  error        VARCHAR(1000) NULL,
  PRIMARY KEY (id),
  KEY ix_job_runs_job_started (job, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='EF-GML-18 : journal des exécutions planifiées ou manuelles';

CREATE TABLE llm_calls (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task           VARCHAR(40)  NOT NULL,
  provider       ENUM('claude','gemini') NOT NULL,
  model          VARCHAR(80)  NOT NULL,
  outcome        ENUM('success','error','timeout','invalid_output') NOT NULL,
  duration_ms    INT UNSIGNED NOT NULL,
  input_tokens   INT UNSIGNED NULL,
  output_tokens  INT UNSIGNED NULL,
  called_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_llm_calls_called_provider (called_at, provider) COMMENT 'Coût mensuel ENF-COU-01'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='EF-IA-06 : aucune donnée de contenu, uniquement des métriques';
