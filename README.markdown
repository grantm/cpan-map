CPAN::Map
=========

This repository hosts the source code for the http://mapofcpan.org/ web site.
You can check it out and run it locally.  It will eventually be packaged as a
CPAN distribution to make installing the dependencies easier - they're
currently listed in dist.ini.

The web site itself is a client-side Javascript app that talks to the
https://api.metacpan.org/ site.  The Javascript code loads some images and
other data which are generated periodically as static files by the supplied
Perl scripts.
