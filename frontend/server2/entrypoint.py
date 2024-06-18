import os
import ast
import inspect
import shutil
import json
from computations import compute

def main():
    original_path = os.getcwd()

    # Check for all the files in the /files directory
    files_dir = os.path.join("/files")
    if not os.path.exists(files_dir):
        os.makedirs(files_dir, exist_ok=True)

    if os.path.exists(files_dir):
        for item in os.listdir(files_dir):
            src_path = os.path.join(files_dir, item)
            dst_path = os.path.join(os.getcwd(), item)
            shutil.move(src_path, dst_path)

    # Get current dir files and folders
    initial_files_and_folders = set(os.listdir())
    #print("Initial files: ", initial_files_and_folders)

    params = list()
    inputs = dict()
    debug_inputs = dict()

    block_id = os.getenv("_blockid_")
    #print("block id: ", block_id)

    for key in inspect.signature(compute).parameters.keys():
        value = os.getenv(key)
        debug_inputs[key] = value
    
    print("debug|||", debug_inputs)

    for key in inspect.signature(compute).parameters.keys():
        value = os.getenv(key)
        debug_inputs[key] = value
        params.append(ast.literal_eval(value))
        inputs[key] = value
    
    json_inputs = json.dumps(inputs)
    print("inputs|||", json_inputs)

    outputs = compute(*params)

    # the "|||" are used for parsing
    json_outputs = json.dumps(outputs)
    print("outputs|||", json_outputs)

    os.chdir(original_path)
    for key, value in outputs.items():
        with open(block_id + "-" + key + ".txt", "w") as file:
            file.write(json.dumps(value))

    # Check the current execution directory for files and folders after the compute function executes
    current_files_and_folders = set(os.listdir())
    #print("Current dir: ", current_files_and_folders)

    # Diff the new exec dir files and folders from the 1st exec dir files and folders state
    new_items = current_files_and_folders - initial_files_and_folders
    #print("New items: ", new_items)

    # 6. Copy any new files in the current execution directory to /files
    if os.path.exists(files_dir):
        for item in new_items:
            src_path = os.path.join(os.getcwd(), item)
            dst_path = os.path.join(files_dir, item)
            if os.path.isdir(src_path):
                shutil.copytree(src_path, dst_path, dirs_exist_ok=True)
            else:
                shutil.copy2(src_path, dst_path)

    # Moving offers no noticeable speedup in execution time
#    if os.path.exists(files_dir):
#        for item in new_items:
#            src_path = os.path.join(os.getcwd(), item)
#            dst_path = os.path.join(files_dir, item)
#
#            print(f"Moving {item} from {src_path} to {dst_path}")
#            shutil.move(src_path, dst_path)

if __name__ == "__main__":
    main()
