from .zetahelper import block_maker
import sys
import ast

import linecache
import inspect














if not len(sys.argv) >= 2:
    raise ValueError("YOU HAVE TO PASS A FUNCTION STRING")





package_names = ''
if len(sys.argv) >= 3 and sys.argv[2]:
    package_names=sys.argv[2]

name = None
if len(sys.argv) >= 4 and sys.argv[3]:
    name = sys.argv[3]

description = 'Block generated from a Python function'
if len(sys.argv) >= 5 and sys.argv[4]:
    description = sys.argv[4]



block_maker(sys.argv[1], package_names=package_names, name=name, description=description)

