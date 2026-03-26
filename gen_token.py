import json
import time
import base64
import hmac
import hashlib

SECRET_KEY = "civicai-secure-prod-key-6dae2333-1348-4cf7-aba1-47311f1e6501".encode('utf-8')

def make_token(phone, role):
    header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').decode('utf-8').rstrip("=")
    payload_dict = {"phone": phone, "role": role, "exp": int(time.time()) + 3600}
    payload = base64.urlsafe_b64encode(json.dumps(payload_dict).encode('utf-8')).decode('utf-8').rstrip("=")
    signature = base64.urlsafe_b64encode(
        hmac.new(SECRET_KEY, f"{header}.{payload}".encode('utf-8'), hashlib.sha256).digest()
    ).decode('utf-8').rstrip("=")
    return f"{header}.{payload}.{signature}"

token = make_token("+919999999999", "admin")
print(token)
