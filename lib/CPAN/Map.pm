package CPAN::Map;

use warnings;
use strict;

use CPAN::Map::Builder;


=head1 NAME

CPAN::Map - The code behind mapofcpan.org

=head1 SYNOPSIS

    use CPAN::Map;

    CPAN::Map->build(
        # options, e.g.:
        verbose => 1,
    );

=head1 DESCRIPTION

The Map of CPAN is a web application for visualising and exploring
distributions on CPAN.  Although the map provides a dynamic, interactive user
interface, the application's AJAX requests are serviced directly by
api.metacpan.org, so this source package does not include any server-side code.
The role of this package is to generate the static data files and images used
by the map.

=head1 METHODS

=head2 build

The C<build> method coordinates parsing the base data out of the
F<modules/02packages.details.txt.gz> and F<authors/01mailrc.txt.gz> files from
CPAN and using this data to generate map images and a summary data file for
consumption by the Javascript code.

This method is a thin wrapper around L<CPAN::Map::Builder>.  All supplied
arguments are passed to the CPAN::Map::Builder constructor.

=cut

sub build {
    my $class   = shift;
    my $builder = CPAN::Map::Builder->generate( @_ );
}


=head1 BUGS

Please report any bugs or feature requests through the github issue tracker at
L<https://github.com/grantm/cpan-map/issues>.  I will be notified, and then
you'll automatically be notified of progress on your bug as I make changes.


=head1 SUPPORT

You can find documentation for this module with the perldoc command.

    perldoc CPAN::Map

You can also look for information at:

=over 4

=item * source repository

L<https://github.com/grantm/cpan-map/>

=item * issue tracker

L<https://github.com/grantm/cpan-map/issues>

=item * AnnoCPAN: Annotated CPAN documentation

L<http://annocpan.org/dist/CPAN::Map>

=item * MetaCPAN

L<https://metacpan.org/release/CPAN-Map>

=back


=head1 ACKNOWLEDGEMENTS

The Map of CPAN application relies heavily on the web API provided by
metacpan.org.

=head1 COPYRIGHT AND LICENSE

Copyright 2011 Grant McLean C<< <grantm@cpan.org> >>

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License, Version 3 or later by the
Free Software Foundation.  You should have received a copy of the GNU Affero
General Public License along with this program.  If not, see
L<http://www.gnu.org/licenses/>.

=cut

1;

