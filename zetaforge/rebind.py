import subprocess
import time
import json

def check_for_container(name):
    ls_cmd = subprocess.run(["docker", "container", "ls", '--format', 'json'], capture_output=True, text=True)
    container_id = None

    if ls_cmd.returncode == 0:
        output_list = ls_cmd.stdout.splitlines()

        for container_str in output_list:
            if container_str.strip():
                container = json.loads(container_str.strip())
                if container['Names'].startswith(name):
                    container_id = container['ID']
                    break
    else:
        print(f"Error: {ls_cmd.stderr}")

    if container_id:
        print(f"Container ID: {container_id}")
        return container_id
    else:
        print("No matching container found.")
        return None

name = "k8s_registry"
container_id = check_for_container(name)

registry_port = 5000
ins_cmd = subprocess.run(["docker", "inspect", str(container_id)], capture_output=True, text=True)

json_data = json.loads(ins_cmd.stdout)[0]
volumename = ""
for item in json_data.get("Mounts", []):
    volumetype = item.get("Type", "")
    if volumetype == 'volume':
        volumename = item.get("Name", "")
print("Volume: ", volumename)
    
print("Binding k8s registry to registry pod")
regcmd = subprocess.Popen(["docker", "run", "--rm", "--name", "registry", "-p", f"{registry_port}:5000", "-v", f"{volumename}:/var/lib/registry", "registry:2"],  stdout=subprocess.PIPE, stderr=subprocess.PIPE)

while True:
    checkcmd = subprocess.run(["docker", "inspect", "registry"], capture_output=True)  
    
    if checkcmd.stdout:
        break
    
    time.sleep(1)

regcmd.terminate()
print("Completed binding pods")
