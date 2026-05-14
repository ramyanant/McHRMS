"""
McHR&TA Configuration
Environment-based configuration with sensible defaults.
"""
import os

class Config:
    # Core
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production')
    DATABASE_URL = os.environ.get('DATABASE_URL', '')
    
    # Security
    SESSION_HOURS = int(os.environ.get('SESSION_HOURS', 8))
    BCRYPT_ROUNDS = int(os.environ.get('BCRYPT_ROUNDS', 12))
    MAX_LOGIN_ATTEMPTS = int(os.environ.get('MAX_LOGIN_ATTEMPTS', 5))
    LOGIN_LOCKOUT_MINUTES = int(os.environ.get('LOGIN_LOCKOUT_MINUTES', 15))
    
    # Rate limiting
    RATELIMIT_DEFAULT = "200 per day;50 per hour"
    RATELIMIT_LOGIN = "10 per minute"
    
    # Email
    MAIL_SERVER   = os.environ.get('MAIL_SERVER', '')
    MAIL_PORT     = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USE_TLS  = os.environ.get('MAIL_USE_TLS', 'true').lower() == 'true'
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', '')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')
    MAIL_FROM     = os.environ.get('MAIL_FROM', 'noreply@mcraan.com')
    
    # File uploads
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', '/tmp/mchrms_uploads')
    ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'xls', 'xlsx'}
    
    # App
    APP_NAME    = 'McHR&TA'
    APP_VERSION = '2.0.0'
    DEBUG       = False
    TESTING     = False

class DevelopmentConfig(Config):
    DEBUG        = True
    BCRYPT_ROUNDS = 4  # Faster in dev

class ProductionConfig(Config):
    DEBUG = False
    # Enforce secure settings in production
    @classmethod
    def validate(cls):
        required = ['SECRET_KEY', 'DATABASE_URL']
        missing = [k for k in required if not os.environ.get(k)]
        if missing:
            raise RuntimeError(f"Missing production env vars: {missing}")

config = {
    'development': DevelopmentConfig,
    'production':  ProductionConfig,
    'default':     DevelopmentConfig,
}

def get_config():
    env = os.environ.get('FLASK_ENV', 'default')
    return config.get(env, config['default'])
