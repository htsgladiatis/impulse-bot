import paramiko, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

HOST = "109.69.22.112"
USER = "root"
PASS = "And716443@"
LOCAL_DIR = r"C:\Users\user\Desktop\cline\impulse-bot\webchat"
REMOTE_DIR = "/opt/impulse-bot/webchat"

def upload_dir(sftp, local, remote):
    try:
        sftp.stat(remote)
    except FileNotFoundError:
        sftp.mkdir(remote)
    for item in os.listdir(local):
        lp = os.path.join(local, item)
        rp = remote + "/" + item
        if os.path.isfile(lp):
            print(f"  Upload: {item}")
            sftp.put(lp, rp)
        elif os.path.isdir(lp):
            upload_dir(sftp, lp, rp)

def run_cmd(ssh, cmd):
    print(f"> {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=60)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out:
        print(out)
    if err:
        print(err)
    return out, err

print("Connecting to server...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)
print("Connected!")

sftp = ssh.open_sftp()
print("Uploading webchat...")
upload_dir(sftp, LOCAL_DIR, REMOTE_DIR)
sftp.close()
print("Upload complete!")

run_cmd(ssh, f"cd {REMOTE_DIR} && npm install --production")
run_cmd(ssh, "pm2 delete impulse-webchat 2>/dev/null; cd /opt/impulse-bot && pm2 start webchat/server.js --name impulse-webchat")
run_cmd(ssh, "pm2 save")
out, _ = run_cmd(ssh, "curl -s http://localhost:3002/health")
print(f"\nHealth check: {out}")

run_cmd(ssh, "pm2 status")
ssh.close()
print("\nDone!")