import json
import os

from setuptools import find_packages, setup


def get_package_version():
    # Specify the path to the package.json file
    package_json_path = os.path.join(os.path.dirname(__file__), 'frontend', 'package.json')
    try:
        # Read the contents of package.json
        with open(package_json_path, 'r') as file:
            package_data = json.load(file)

        # Extract the version from the package data
        version = package_data.get('version')

        if version:
            # Set the __version__ variable in your package's __init__.py
            with open("zetaforge/__init__.py", "w") as fp:

                fp.write(f"__version__ = '{version}'\nfrom .block_maker.zetahelper import block_maker")
            return version
        else:
            raise ValueError("Version not found in package.json")

    except FileNotFoundError:
        raise FileNotFoundError("package.json not found")
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON format in package.json")


setup(
    version = get_package_version(),
    entry_points={
        'console_scripts': [
            'zetaforge = zetaforge.forge_cli:main'
        ]
    },
    packages=find_packages(include=('zetaforge',)),
    include_package_data=True,
    package_data={'zetaforge': ['utils/*', 'executables/*', 'block_maker/*'],},)
