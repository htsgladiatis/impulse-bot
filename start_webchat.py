import paramiko, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("109.69.22.112", username="root", password="And716443@", timeout=15)
print("Connected!")

def run(cmd):
    print(f"> {cmd}")
    _, o, e = ssh.exec_command(cmd, timeout=60)
    print(o.read().decode(errors='replace'))
    print(e.read().decode(errors='replace'))

run("pm2 delete impulse-webchat 2>/dev/null; cd /opt/impulse-bot && pm2 start webchat/server.js --name impulse-webchat")
run("pm2 save")
run("curl -s http://localhost:3002/health")
run("pm2 status")
ssh.close()
print("Done!")