import secrets
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash


# Shared SQLAlchemy instance. It is initialized by the Flask application.
db = SQLAlchemy()
