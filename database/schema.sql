-- database/schema.sql

DROP DATABASE IF EXISTS skillsathi;
CREATE DATABASE skillsathi;
USE skillsathi;

-- 🏢 COMPANIES TABLE (Updated with Admin & Contact fields)
CREATE TABLE companies (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    business_reg_number VARCHAR(100),
    
    -- Added based on your backend logic
    primary_contact_name VARCHAR(255),
    citizenship_number VARCHAR(100),
    contact_photo LONGBLOB,
    registration_document LONGBLOB,
    is_admin BOOLEAN DEFAULT FALSE,
    signature_image LONGBLOB, 
    
    status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
    subscription_tier ENUM('free', 'basic', 'medium', 'pro') DEFAULT 'free',
    certificates_used INT DEFAULT 0,
    logo LONGBLOB,
    business_address VARCHAR(255),
    phone_number VARCHAR(20),
    website_url VARCHAR(255),
    timezone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 👥 WORKERS TABLE
CREATE TABLE workers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    worker_id VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role ENUM('owner', 'admin', 'manager', 'member') DEFAULT 'member',
    status ENUM('active', 'pending', 'suspended') DEFAULT 'active',
    profile_picture LONGBLOB,
    phone_number VARCHAR(20),
    date_of_birth DATE,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- 📜 CERTIFICATES TABLE (Added 'pending_approval' to Enum)
CREATE TABLE certificates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    certificate_uid VARCHAR(100) UNIQUE NOT NULL,
    company_id INT NOT NULL,
    worker_id INT NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255),
    recipient_photo LONGBLOB,
    course_title VARCHAR(255) NOT NULL,
    course_category VARCHAR(100),
    completion_date DATE NOT NULL,
    issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiration_date DATE,
    duration_hours INT,
    final_score DECIMAL(5,2),
    attendance_percentage DECIMAL(5,2),
    skill_level ENUM('beginner', 'intermediate', 'advanced', 'expert'),
    additional_notes TEXT,
    sha_hash VARCHAR(64) UNIQUE NOT NULL,
    
    -- Updated ENUM to include 'pending_approval'
    status ENUM('active', 'revoked', 'expired', 'pending_approval') DEFAULT 'pending_approval',
    
    qr_code LONGBLOB,
    pdf_data LONGBLOB,
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMP NULL,
    download_count INT DEFAULT 0,
    verification_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

-- ✅ VERIFICATIONS TABLE
CREATE TABLE verifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    certificate_uid VARCHAR(100) NOT NULL,
    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    verification_method ENUM('qr_scan', 'manual_entry', 'direct_link'),
    success BOOLEAN NOT NULL,
    location_country VARCHAR(100),
    location_city VARCHAR(100),
    FOREIGN KEY (certificate_uid) REFERENCES certificates(certificate_uid) ON DELETE CASCADE
);

-- 📊 AUDIT_LOGS TABLE
CREATE TABLE audit_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT DEFAULT NULL, 
    user_id INT DEFAULT NULL,    
    
    -- Identifying who did it (Company vs Worker)
    actor_type ENUM('company', 'staff', 'public', 'system') NOT NULL,
    actor_id INT,http://127.0.0.1:3000/frontend/index.html
    
    cert_id INT,
    event_type VARCHAR(100), -- e.g., 'login', 'issue_certificate'
    
    details TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES workers(id) ON DELETE SET NULL,
    FOREIGN KEY (cert_id) REFERENCES certificates(id) ON DELETE SET NULL
);

-- 🔗 SHARED CERTIFICATES (For temporary links)
CREATE TABLE shared_certificates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cert_id INT NOT NULL,
    token VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (cert_id) REFERENCES certificates(id) ON DELETE CASCADE
);