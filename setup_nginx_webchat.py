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
    out = o.read().decode(errors='replace')
    err = e.read().decode(errors='replace')
    if out: print(out)
    if err: print(err)

# Check existing nginx configs
run("ls /etc/nginx/sites-enabled/")
run("cat /etc/nginx/sites-enabled/impulse")

ssh.close()
print("Done!")