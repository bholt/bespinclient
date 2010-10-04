#  ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1
# 
# The contents of this file are subject to the Mozilla Public License  
# Version
# 1.1 (the "License"); you may not use this file except in compliance  
# with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
# 
# Software distributed under the License is distributed on an "AS IS"  
# basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the  
# License
# for the specific language governing rights and limitations under the
# License.
# 
# The Original Code is Bespin.
# 
# The Initial Developer of the Original Code is Mozilla.
# Portions created by the Initial Developer are Copyright (C) 2009
# the Initial Developer. All Rights Reserved.
# 
# Contributor(s):
# 
# ***** END LICENSE BLOCK *****
# 
import sys
import os
import os.path
import subprocess
import urllib2
import tarfile
from cStringIO import StringIO
import webbrowser
import re
import zipfile

from paver.easy import *
from paver.setuputils import setup
import paver.virtual

setup(
    name="dryice",
    version="0.9a3",
    packages=["dryice"],
    entry_points="""
[console_scripts]
dryice=dryice.tool:main
"""
)

options(
    version=Bunch(
        number="0.9a3",
        name="Edison",
        api="4"
    ),
    virtualenv=Bunch(
        paver_command_line="initial"
    ),
    server=Bunch(
        # set to true to allow connections from other machines
        address="",
        port="8080",
        try_build=False,
        dburl=None,
        async=False,
        config_file=path("devconfig.py"),
        directory=path("../bespinserver/").abspath(),
        clientdir=path.getcwd()
    ),
    server_pavement=lambda: options.server.directory / "pavement.py",
    builddir=path("tmp"),
    install_tiki=Bunch(
        git=False,
        force=False
    ),
    jsdocs=Bunch(
        download_url="http://jsdoc-toolkit.googlecode.com/files/jsdoc_toolkit-2.3.0.zip",
        download_location=path("external") / "jsdoc_toolkit-2.3.0.zip",
        dest_dir=path("external") / "jsdoc-toolkit"
    ),
    fetch_compiler=Bunch(
        dest_dir=path("external") / "compiler",
        download_url="http://closure-compiler.googlecode.com/files/compiler-latest.zip",
        download_location=path("external") / "compiler-latest.zip"
    )
)

TIKI_TEMPLATE = u"""
(function() {
%(preamble)s
tiki.register('%(package_id)s', {
"name": "tiki",
"version": "%(TIKI_VERSION)s"
});

tiki.module('%(package_id)s:tiki', function(require, exports, module) {
%(body)s
});
%(postamble)s

bespin.tiki = tiki;
})();

"""

@cmdopts([('git', 'g', 'use git to download'), ('force', 'f', 'force download of snapshot')])
def install_tiki(options):
    """Installs the versions of Tiki that are required.
    Can optionally download using git, so that you can keep
    up to date easier."""
    
    snapshot = path("static") / "tiki.js"
    if snapshot.exists():
        if options.force:
            snapshot.unlink()
        else:
            info("Tiki snapshot installed already.")
            return

    if not options.git:
        info("Downloading Tiki Snapshot")
        preamble = urllib2.urlopen("http://github.com/pcwalton/tiki/raw/master/__preamble__.js").read().decode("utf8")
        body = urllib2.urlopen("http://github.com/pcwalton/tiki/raw/master/lib/tiki.js").read().decode("utf8")
        postamble = urllib2.urlopen("http://github.com/pcwalton/tiki/raw/master/__postamble__.js").read().decode("utf8")
        TIKI_VERSION = u"1.0.0"
        package_id = u"::tiki/%s" % (TIKI_VERSION)
        snapshot.write_text(TIKI_TEMPLATE % locals(), "utf8")
        return

    def get_component(base_name, dest_name, dest_path=".", branch=None, account="pcwalton"):
        dest_complete = path(dest_path) / dest_name
        if dest_complete.exists():
            info("%s is already here, no action being taken", base_name)
            return
            
        if not options.git:
            if branch is None:
                branch = "master"
            info("Downloading %s/%s as a tarball", base_name, branch)
            tarball = urllib2.urlopen("http://github.com/%s/%s/tarball/%s" % (account, base_name, branch))
            dirname = tarball.url.split('/')[-1].split('.')[0]
            tar = tarfile.open(name=("%s.tgz" % base_name), fileobj=StringIO(tarball.read()))
            tar.extractall(dest_path)
            tar.close()
            os.rename(os.path.join(dest_path, dirname), os.path.join(dest_path, dest_name))
            return

        info("Checking out %s/%s", base_name, branch)
        sh("git clone -q git://github.com/%s/%s.git %s" % (account, base_name, dest_name), cwd=dest_path)
        if branch:
            sh("git checkout --track origin/%s" % branch, cwd=os.path.join(dest_path, dest_name))

    get_component("tiki", "tiki", dest_path="frameworks")
    get_component("core_test", "core_test", dest_path="frameworks")
    preamble = path("frameworks/tiki/__preamble__.js").text('utf8')
    postamble = path("frameworks/tiki/__postamble__.js").text('utf8')
    body = path("frameworks/tiki/lib/tiki.js").text('utf8')
    TIKI_VERSION = "1.0.0"
    package_id = "::tiki/%s" % (TIKI_VERSION)
    snapshot.write_text(TIKI_TEMPLATE % locals(), 'utf8')

@task
@cmdopts([('force', 'f', 'force download of snapshot')])
def install_jquery(options):
    destination = path("plugins/thirdparty/jquery.js")
    if destination.exists() and not options.force:
        info("jquery already installed")
        return
    
    destination.unlink()
    
    info("Downloading jquery")
    jquery = urllib2.urlopen("http://code.jquery.com/jquery-1.4.2.js").read().decode("utf8")
    jquery = u"""
"define metadata";
({});
"end";

""" + jquery + """
exports.$ = $.noConflict(true);
"""
    destination.write_text(jquery, "utf8")

@task
def initial():
    """Initial setup help."""
    call_task('install_jquery')
    call_task('install_tiki')
    call_task("develop")
    venv_command = "Scripts/activate.bat" if sys.platform == 'win32' \
        else "source bin/activate"
    linux_note = "" if not sys.platform.startswith("linux") else """

    *** NOTE FOR LINUX USERS: If you are running on a Linux system, you will 
    likely need a "python-dev" (on Ubuntu, possibly python-devel elsewhere) 
    package installed and either the libc-dev or libc6-dev package, if you 
    do not already have them.

"""
    
    mac_note = "" if not sys.platform.startswith("darwin") else """

    *** NOTE FOR MAC USERS: You will need Xcode installed.
    
    If you put your Bespin checkout in a directory
    that has a space in the directory name, the bootstrap script will fail
    with an error "no such file or directory" because there will be
    scripts generated with an invalid shebang (#!) line.

"""

    win_note = "" if not sys.platform.startswith("win") else """

    Note about running on Windows
    -----------------------------

    The current, up-to-date Bespin backend is written in Python. Because
    Python is cross-platform, it should be possible (and likely not too
    difficult) to make the backend work on Windows once Python 2.5 is
    installed. However, this has not been tested and there are likely two
    issues:

    1. some libraries used by Bespin try to compile C code (*)
    2. some paths may not be correct on Windows systems

    Microsoft offers free command line compilers that work well with
    Python.

"""
    print """Welcome to the Bespin Developer Build!

We want to get your development server up and running quickly.
If you run into trouble, please head over to the Bespin
Googlegroup and we can help:

http://groups.google.com/group/bespin/

We maintain a Python-based web server that is easy to get
running in development. It works with Python 2.5 or 2.6
only.
%s%s%s
The Python server lives in a separate Mercurial repository.
To get the Python server installed, run these two commands:

%s
paver install_server

* NOTE: "paver" always needs to be run in the directory with the
pavement.py file (eg, the "bespinclient" directory).
""" % (mac_note, linux_note, win_note, venv_command)

@task
def install_server(options):
    """Install or update the development server."""
    call_pavement(options.server_pavement, "develop")
    print """
Look for error messages in the output above. If everything looks
good, you can start the server by running:

paver start
"""

@task
def create_db(options):
    """Create the development database."""
    info("Calling create_db in bespinserver")
    call_pavement(options.server_pavement, "create_db")

@task
def upgrade():
    """Upgrade your database."""
    call_pavement(options.server_pavement, "upgrade")

@task
def start(options):
    """Starts the BespinServer on localhost port 4020 for development.
    
    Go to http://localhost:4020/editor
    to launch the editor app.
    
    You can change the port and allow remote connections by setting
    server.port or server.address on the command line.
    
    paver server.address=your.ip.address server.port=8000 start
    
    will allow remote connections (assuming you don't have a firewall
    blocking the connection) and start the server on port 8000.
    """
    additional_options = []
    if options.server.address:
        additional_options.append("server.address=%s" % (options.server.address))
    
    additional_options.append("staticdir=static")
    
    paver_command = additional_options +     ["clientdir=../bespinclient", 
            "server.port=%s" % (options.server.port), 
            "start"]
        
    call_pavement("../bespinserver/pavement.py", paver_command)

def update_python_version():
    version_file = options.server.directory / "bespin" / "__init__.py"
    in_version_block = False
    lines = version_file.lines()
    replaced_lines = []
    for i in range(0, len(lines)):
        line = lines[i]
        if "BEGIN VERSION BLOCK" in line:
            in_version_block = True
            continue
        if "END VERSION BLOCK" in line:
            break
        if not in_version_block:
            continue
        if line.startswith("VERSION ="):
            lines[i] = "VERSION = '%s'\n" % (options.version.number)
        elif line.startswith("VERSION_NAME ="):
            lines[i] = 'VERSION_NAME = "%s"\n' % (options.version.name)
        elif line.startswith('API_VERSION'):
            lines[i] = "API_VERSION = '%s'\n" % (options.version.api)
        else:
            raise BuildFailure("Invalid Python version number line: %s" % line)
        replaced_lines.append(line)
    version_file.write_lines(lines)
    return replaced_lines
    
def restore_python_version(replaced_lines):
    version_file = options.server.directory / "bespin" / "__init__.py"
    lines = version_file.lines()
    version_block_start = None
    version_block_end = None
    for i in range(0, len(lines)):
        line = lines[i]
        if "BEGIN VERSION BLOCK" in line:
            version_block_start = i
        if "END VERSION BLOCK" in line:
            version_block_end = i
            break
    lines[version_block_start+1:version_block_end] = replaced_lines
    version_file.write_lines(lines)

def update_javascript_version():
    version_file = path("plugins") / "boot" / "bespin" / "index.js"
    in_version_block = False
    lines = version_file.lines()
    replaced_lines = []
    for i in range(0, len(lines)):
        line = lines[i]
        if "BEGIN VERSION BLOCK" in line:
            in_version_block = True
            continue
        if "END VERSION BLOCK" in line:
            break
        if not in_version_block:
            continue
            
        replaced_lines.append(line)
        
        # ignore comment lines
        if "/**" in line or re.match(r'^\s*$', line):
            pass
        elif "versionNumber = " in line:
            lines[i] = "exports.versionNumber = '%s';\n" % (options.version.number)
        elif 'versionCodename = ' in line:
            lines[i] = "exports.versionCodename = '%s';\n" % (options.version.name)
        elif 'apiVersion = ' in line:
            lines[i] = "exports.apiVersion = '%s';\n" % (options.version.api)
        else:
            raise BuildFailure("Invalid JavaScript version number line: %s" % line)
        
    version_file.write_lines(lines)
    return replaced_lines
    
def restore_javascript_version(replaced_lines):
    version_file = path("plugins") / "boot" / "bespin" / "index.js"
    lines = version_file.lines()
    version_block_start = None
    version_block_end = None
    for i in range(0, len(lines)):
        line = lines[i]
        if "BEGIN VERSION BLOCK" in line:
            version_block_start = i
        if "END VERSION BLOCK" in line:
            version_block_end = i
            break
    lines[version_block_start+1:version_block_end] = replaced_lines
    version_file.write_lines(lines)


@task
@needs(['generate_setup', 'build_docs', 'fetch_compiler', 'sdist', 'release_embed'])
def dist(options):
    """Build the server package.
    
    Creates the BespinServer.tar.gz file with all of the pieces for production
    deployment."""
    output_dir = path("tmp/BespinServer")
    output_dir.rmtree()
    
    replaced_lines = update_python_version()
    
    sh("bin/pip freeze -r %s > %s" % (options.server.directory / "requirements.txt",
                                      options.server.directory / "production" / "requirements.txt"))
    
    try:
        call_pavement(options.server_pavement, "production")
    finally:
        restore_python_version(replaced_lines)
        
    production_dir = options.server.directory / "production"
    production_dir.copytree("tmp/BespinServer")
    
    sdist = path("dist") / ("dryice-%s.tar.gz" % (options.version.number))
    sdist.copy(output_dir / "libs")
    
    closure_compiler = options.fetch_compiler.dest_dir / "compiler.jar"
    
    replaced_lines = update_javascript_version()
    try:
        info(sh('dryice -j%s production.json' % 
            (closure_compiler,), 
            capture=True))
    finally:
        restore_javascript_version(replaced_lines)
        
    built_dropin = path("tmp") / ("BespinEmbedded-DropIn-%s" % (options.version.number))
    built_dropin.copytree(output_dir / "static" / "embedded")
    
    built_docs = path("tmp") / "docs"
    built_docs.copytree(output_dir / "static" / "docs")
    
    index_file = path("dryice") / "prodindex.html"
    index_file.copy(output_dir / "static" / "index.html")
    (path("static") / "favicon.ico").copy(output_dir / "static" / "favicon.ico")
    
    sh("tar czf BespinServer.tgz BespinServer", cwd="tmp")
    
    
@task
def build_docs(options):
    """Builds the documentation."""
    if not path("src/growl").exists():
        sh("pip install -r requirements.txt")
    builddir = options.builddir
    builddir.mkdir()
    docsdir = builddir / "docs"
    sh("growl.py . ../%s" % docsdir, cwd="docs")
    

@task
@needs(['build_docs', 'fetch_compiler'])
def release_embed(options):
    builddir = options.builddir
    if not builddir.exists():
        builddir.mkdir()
    
    closure_compiler = options.fetch_compiler.dest_dir / "compiler.jar"
    
    version = options.version.number
    
    replaced_lines = update_javascript_version()
    try:
        outputdir = builddir / ("BespinEmbedded-%s" % (version))
        info("Building Customizable package")
        if outputdir.exists():
            outputdir.rmtree()
        outputdir.mkdir()
        
        builtdir = outputdir / "prebuilt"
        info("Compiling prebuilt Bespin")
        info(sh('dryice -j%s -Doutput_dir=\\"%s\\" dropin.json' % 
            (closure_compiler, builtdir), 
            capture=True, ignore_error=True))
        
        path("LICENSE.txt").copy(outputdir / "LICENSE.txt")
        path("embedded/README-Customizable.txt").copy(outputdir / "README.txt")
        (builddir / "docs").copytree(outputdir / "docs")
    finally:
        restore_javascript_version(replaced_lines)
    
    libdir = outputdir / "lib"
    libdir.mkdir()
    dryice_dest = libdir / "dryice"
    path("dryice").copytree(dryice_dest)
    for f in dryice_dest.walkfiles("*.pyc"):
        f.unlink()
    
    import static
    static_library = path(static.__file__)
    if static_library.endswith(".pyc"):
        static_library = path(static_library[:-1])
        
    static_library.copy(libdir / "static.py")
    
    path("static/tiki.js").copy(libdir / "tiki.js")
    path("static/BespinEmbedded.js").copy(libdir / "worker.js")
        
    path("embedded/dryice.py").copy(outputdir / "dryice.py")
    path("plugins").copytree(outputdir / "plugins")
    path("embedded/sample.json").copy(outputdir / "sample.json")
    
    compressors_dir = outputdir / "compressors"
    compressors_dir.mkdir()
    
    closure_compiler.copy(compressors_dir / "compiler.jar")
    
    sh("tar czf BespinEmbedded-%s.tar.gz BespinEmbedded-%s" % \
        (version, version), cwd="tmp")
    
def _fetchfile(name, dest_dir, download_location, download_url):
    external = path("external")
    if not dest_dir.exists():
        dest_dir.makedirs()
        if not download_location.exists():
            info("Downloading %s from %s", name, download_url)
            zi = urllib2.urlopen(download_url)
            zo = open(download_location, "wb")
            zo.write(zi.read())
            zo.close()
            zi.close()
        
        info("Uncompressing %s", name)    
        zf = zipfile.ZipFile(download_location)
        for name in zf.namelist():
            pieces = name.split('/', 1)
            if len(pieces) == 1:
                dest_dir.makedirs()
                
                info("Expanding %s", name)
                open(dest_dir / name, "wb").write(zf.read(name))
                continue
                
            outname = name.split('/', 1)[1]
            if name.endswith('/'):
                (dest_dir / outname).makedirs()
            else:
                info("Expanding %s", outname)
                open(dest_dir / outname, "wb").write(zf.read(name))
    
    
@task
def fetch_compiler(options):
    """Fetches the Closure Compiler used to compress builds."""
    _fetchfile("Closure Compiler", options.fetch_compiler.dest_dir, options.fetch_compiler.download_location,
        options.fetch_compiler.download_url)
    
@task
def jsdocs(options):
    """Generate API documentation using the jsdoc-toolkit."""
    _fetchfile("jsdoc-toolkit", options.dest_dir, options.download_location,
        options.download_url)
        
    outputdir = options.builddir / "docs" / "api"
    if outputdir.exists():
        outputdir.rmtree()
    outputdir.makedirs()
    sourcedir = (path.getcwd() / "frameworks" / "bespin").abspath()
    
    command = ("java -jar jsrun.jar app/run.js -a "
                    "--directory=%s "
                    "--encoding=utf-8 "
                    "--recurse=10 "
                    "--securemodules "
                    "--template=%s/templates/jsdoc "
                    "--verbose "
                    "%s") % (outputdir.abspath(), options.dest_dir.abspath(), sourcedir)
                    
    sh(command, cwd=options.dest_dir)
        
    
@task
def docs(options):
    """Display the documentation in your web browser."""
    docdir = options.builddir / "docs"
    if not docdir.exists():
        call_task("build_docs")
    webbrowser.open("file:///%s/index.html" % docdir.abspath())

@task
def tags(options):
    """Generates tags for Bespin using jsctags."""
    args = [ "jsctags" ]
    for dir in path("plugins").dirs():
        args += [ "-L", dir, dir ]
    for file in path("static").files("*.js"):
        args.append(file)
    sh(" ".join(args))

@task
@needs('fetch_compiler')
def bookmarklet(options):
    """Generates the bookmarklet site."""
    outputdir = options.builddir / "bookmarklet"
    if outputdir.exists():
        outputdir.rmtree()
    
    outputdir.mkdir()
    closure_compiler = options.fetch_compiler.dest_dir / "compiler.jar"
    
    srcdir = path("browser/bookmarklet")
    
    for f in srcdir.glob('*'):
        if f.basename() in ["bespin", "manifest.json", "bookmarkletui"]:
            continue
        if f.isdir():
            f.copytree(outputdir / f.basename())
        else:
            f.copy(outputdir)
    
    for f in ["index.html", "bookmarklet.js"]:
        f = outputdir / f
        data = f.text()
        data = data.replace("http://localhost:8080", "https://bespin.mozillalabs.com/bookmarklet")
        f.write_text(data)
    
    info(sh('dryice -j%s browser/bookmarklet/manifest.json' % 
        (closure_compiler,), 
        capture=True))
    