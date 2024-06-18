import ast
import inspect
import textwrap
import importlib.metadata
import importlib.util
import json
import uuid
import os
import re
import sys
from datetime import datetime
import linecache
# Mapping of import names to package names
IMPORT_PACKAGE_MAPPING = {
    'cv2': 'opencv-python',
    'PIL': 'Pillow',
    'sklearn': 'scikit-learn',
    'bs4': 'beautifulsoup4',
    'Crypto': 'pycryptodome',
    'yaml': 'PyYAML',
    'mysql': 'mysql-connector-python',
    'pd': 'pandas',
    'np': 'numpy',
    'sqlalchemy': 'SQLAlchemy'
}

# List of standard library modules to exclude from requirements
STANDARD_LIBRARIES = set(sys.builtin_module_names)


def get_function_name(func_str):
    """
    Extracts the name of the function from a string representation of a function definition.
    
    Args:
        func_str (str): A string representing a Python function definition.
    
    Returns:
        str: The name of the function, or None if no valid function name is found.
    """
    pattern = r'def\s+(\w+)\s*\('
    match = re.search(pattern, func_str)
    if match:
        return match.group(1)
    else:
        return None


# monkey patch for getting resources via inspect, for cli usage
def exec_get_source(code, func_name, inspector):
    getlines = linecache.getlines
    def monkey_patch(filename, module_globals=None):
        if filename == '<string>':
            return code.splitlines(keepends=True)
        else:
            return getlines(filename, module_globals)
    linecache.getlines = monkey_patch
    
    try:
        exec(code, globals())
        function = globals()[func_name]
        #you can now use inspect.getsource() on the result of exec() here
        result = inspector(function)
        
    finally:
        linecache.getlines = getlines
        return result
    
def sanitize(name, max_length=63):
    name = name.lower()
    # Replace any character a lowercase letter, digit, or hyphen with a hyphen
    name = re.sub(r'[^a-z0-9-]', '-', name)
    # Remove leading and trailing hyphens
    name = name.strip('-')
    # Truncate to a maximum length. Note: Kubernetes and Argo usually have a max of 63 characters
    if len(name) > max_length:
        name = name[:max_length].rstrip('-')
    return name

def extract_io(source):
    tree = ast.parse(source)
    function_info = {}

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == 'compute':
            # Extract docstring
            docstring = ast.get_docstring(node)
            function_info['description'] = docstring

            # Extract inputs
            inputs = {}
            for arg in node.args.args:
                arg_name = arg.arg
                arg_type = 'Any'  # Default type
                if arg.annotation:
                    # Extract type from annotation if available
                    arg_type = ast.unparse(arg.annotation) if arg.annotation else 'Any'
                inputs[arg_name] = {
                    'type': arg_type,
                    'connections': [],
                    'relays': []
                }
            function_info['inputs'] = inputs

            # Extract outputs
            outputs = {}
            for stmt in node.body:
                if isinstance(stmt, ast.Return):
                    return_value = stmt.value
                    if isinstance(return_value, ast.Dict):
                        for key in return_value.keys:
                            if isinstance(key, ast.Constant) and isinstance(key.value, str):
                                output_name = key.value
                                outputs[output_name] = {
                                    'type': 'Any',
                                    'connections': [],
                                    'relays': []
                                }
                    break  # Stop after finding the first return statement

            function_info['outputs'] = outputs
            break

    return function_info

def generate_id(name):
    return f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:12]}"

def name_to_id(name):
    return name.lower().replace(' ', '-')

def convert_to_specs(source, name, description):
    # Extract input/output specifications
    io = extract_io(source)
    # Generate the specs.json content
    specs = {
        "information": {
            "id": sanitize(name),
            "name": name,
            "description": description if description else io.get('description', 'Template block for custom computations.'),
            "system_versions": ["0.1"],
            "block_version": "1.0",
            "block_source": "code",
            "block_type": "compute"
        },
        "inputs": io.get('inputs', {}),
        "outputs": io.get('outputs', {}),
        "action": {
            "container": {
                "image": sanitize(name),
                "version": "latest",
                "command_line": ["python", "entrypoint.py"]
            }
        },
        "views": {
            "node": {
                "behavior": "modal",
                "active": "True",
                "title_bar": {
                    "background_color": "#228B22"
                },
                "preview": {},
                "html": "",
                "pos_x": "0",
                "pos_y": "0",
                "pos_z": "999"
            }
        },
        "events": {}
    }

    return specs

def get_package_version(package_name):
    try:
        return importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        return "version_not_found"

def add_dockerfile(block_folder):
    python_version = f"{sys.version_info.major}.{sys.version_info.minor}"
    dockerfile_content = f"""FROM python:{python_version}

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir -r requirements.txt
"""

    os.makedirs(block_folder, exist_ok=True)
    dockerfile_path = os.path.join(block_folder, 'Dockerfile')

    with open(dockerfile_path, 'w') as file:
        file.write(dockerfile_content.strip())

def make_computations(func, additional_imports, block_folder):
    # Extract the source code of the function
    func_is_str = False
    func_name = None
    source_code = None
    if isinstance(func, str):
        func_is_str = True
        func_name = get_function_name(func)
        source_code = exec_get_source(func, func_name, inspect.getsource)
    else:
        source_code = inspect.getsource(func)
    print(source_code)
    # Parse the function to get the return statement(s)
    tree = ast.parse(source_code)
    return_nodes = [node for node in ast.walk(tree) if isinstance(node, ast.Return)]

    # Determine the return expressions
    return_exprs = []
    for return_node in return_nodes:
        if isinstance(return_node.value, ast.Tuple):
            for element in return_node.value.elts:
                return_exprs.append(ast.unparse(element))
        else:
            return_exprs.append(ast.unparse(return_node.value))

    # Extract the function's arguments
    func_signature = None
    if func_is_str:
        func_signature = exec_get_source(func, func_name, inspect.signature)
    else:
        func_signature = inspect.signature(func)
    func_args = ", ".join(func_signature.parameters.keys())

    # Extract the function body excluding the first line (def ...)
    func_body_lines = source_code.split("\n")[1:]

    # Remove any original return statements from the body
    func_body_lines = [line for line in func_body_lines if not line.strip().startswith("return")]
    func_body = textwrap.dedent("\n".join(func_body_lines))

    # Construct the return statement with all expressions in a dictionary
    return_dict = ", ".join([f"'{sanitize(expr)}': {expr}" for expr in return_exprs])
    return_statement = f"return {{{return_dict}}}"

    # Generate the compute function code
    compute_code = f"""{additional_imports}

def compute({func_args}):
{textwrap.indent(func_body, '    ')}
    {return_statement}
"""

    # Strip any leading/trailing whitespace from the generated code
    compute_code = compute_code.strip()

    # Write the compute function code to computations.py
    with open(os.path.join(block_folder, "computations.py"), "w") as file:
        file.write(compute_code)

    return compute_code

def make_requirements(package_names, func, block_folder):
    # Generate requirements.txt with versions
    requirements = set()

    # Add requirements from package_names
    for package_name in package_names.split():
        if is_standard_library(package_name):
            continue
        version = get_package_version(package_name)
        if version == "version_not_found":
            print(f"Warning: Package '{package_name}' not found in installed packages.")
        else:
            requirements.add(f"{package_name}=={version}")

    # Extracting imports from the function code
    source_code = None
    if isinstance(func, str):
        func_name = get_function_name(func)
        source_code = exec_get_source(func, func_name, inspect.getsource)
    else:
        source_code = inspect.getsource(func)
    tree = ast.parse(source_code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                package_name = alias.name.split('.')[0]
                if is_standard_library(package_name):
                    continue
                if package_name in IMPORT_PACKAGE_MAPPING:
                    package_name = IMPORT_PACKAGE_MAPPING[package_name]
                version = get_package_version(package_name)
                if version == "version_not_found":
                    print(f"Warning: Package '{package_name}' not found in installed packages.")
                else:
                    requirements.add(f"{package_name}=={version}")
        elif isinstance(node, ast.ImportFrom):
            package_name = node.module.split('.')[0]
            if is_standard_library(package_name):
                continue
            if package_name in IMPORT_PACKAGE_MAPPING:
                package_name = IMPORT_PACKAGE_MAPPING[package_name]
            version = get_package_version(package_name)
            if version == "version_not_found":
                print(f"Warning: Package '{package_name}' not found in installed packages.")
            else:
                requirements.add(f"{package_name}=={version}")

    if not requirements:
        requirements = {"\n\n"}

    # Write the requirements.txt file
    with open(os.path.join(block_folder, "requirements.txt"), "w") as req_file:
        req_file.write("\n".join(requirements))

def is_standard_library(module_name):
    if module_name in STANDARD_LIBRARIES:
        return True
    try:
        spec = importlib.util.find_spec(module_name)
        if spec and spec.origin:
            if 'site-packages' in spec.origin or 'dist-packages' in spec.origin:
                return False
            if 'lib' in spec.origin:
                return True
    except ModuleNotFoundError:
        pass
    return False

def make_specs(compute_code, name, description, block_folder):
    # Generate and write specs_v1.json
    specs = convert_to_specs(compute_code, name, description)
    specs_path = os.path.join(block_folder, 'specs_v1.json')
    with open(specs_path, 'w') as file:
        json.dump(specs, file, indent=4)

def block_maker(func, package_names='', name=None, description='Block generated from a Python function'):
    
    if name is None:
        if(isinstance(func, str)):
            name = get_function_name(func)
        else:
            name = func.__name__
    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')[:-3]
    block_folder = f"{sanitize(name)}-{timestamp}"
    os.makedirs(block_folder, exist_ok=True)

    # Convert package names to import statements
    additional_imports = "\n".join([f"import {pkg}" for pkg in package_names.split()])

    compute_code = make_computations(func, additional_imports, block_folder)
    make_requirements(package_names, func, block_folder)
    add_dockerfile(block_folder)
    make_specs(compute_code, name, description, block_folder)

    print(f"Successfully created the ZetaForge block '{block_folder}'")
    print(f"You can now load this block in ZetaForge using the Load Block button in the File menu.")
    print(f"""
Tips: 
- You can also pass Python package names directly using the package_names argument.
- The function you are passing to the block_maker should contain all function definitions and import statements needed to run your code.
- You can also customize your block name and description.
Usage example: block_maker(my_function, package_names='numpy pandas requests', name='my_block_name', description='my_description')
    """)


# Example usage
# def Custom(a, b):
#     import requests
#     import boto3
#     import cv2
#     import zetaforge
#     import ast
#     import uuuuuu
#     import numpy as np
#     result = a + b
#     # a = np.arange(15).reshape(3, 5)
#     result2 = a - b
#     my_list = ['hello', 1, 3]
#     return result, result2, my_list[0]

# package_names = "numpy pandas requests json aaaaaaaa"

# block_maker(Custom, package_names, name='My Block Name', description='My block description.')
# block_maker(Custom)
