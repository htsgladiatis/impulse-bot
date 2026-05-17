import paramiko, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("109.69.22.112", username="root", password="And716443@", timeout=15)

def run(cmd):
    print(f"> {cmd}")
    _, o, e = ssh.exec_command(cmd, timeout=60)
    out = o.read().decode(errors='replace')
    err = e.read().decode(errors='replace')
    if out: print(out)
    if err: print(err)

# Test via nginx (port 80)
run("curl -s http://localhost/webchat/")
run("curl -s http://localhost/webchat/health")
run("curl -s -o /dev/null -w '%{http_code}' http://localhost/webchat/")

ssh.close()
print("Done!")