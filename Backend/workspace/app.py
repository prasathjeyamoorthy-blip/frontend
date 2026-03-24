from flask import Flask
from routes import users_bp

app = Flask(__name__)
db.init_app(app)

app.register_blueprint(users_bp, url_prefix='/api')

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)