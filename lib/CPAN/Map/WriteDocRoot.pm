package CPAN::Map::WriteDocRoot;

use Moose;
use namespace::autoclean;

require File::Spec;
require File::Path;
require File::Basename;
require File::Find::Rule;
require Digest::MD5;
require URI;
require JavaScript::Minifier::XS;
require CSS::Minifier::XS;
require JSON::XS;

use IO::Compress::Gzip qw(gzip $GzipError);


my %external_script = (
    'static/jquery-1.7.min.js'
        => '//ajax.googleapis.com/ajax/libs/jquery/1.7.1/jquery.min.js',
    'static/jqueryui/1.8.16/ui/minified/jquery-ui.min.js'
        => '//ajax.googleapis.com/ajax/libs/jqueryui/1.8.16/jquery-ui.min.js',
);

has 'builder' => (
    is       => 'ro',
    isa      => 'CPAN::Map::Builder',
    required => 1,
    weak_ref => 1,
);

has 'src_dir' => (
    is       => 'ro',
    isa      => 'Str',
    required => 1,
);

has 'dst_dir' => (
    is       => 'ro',
    isa      => 'Str',
    required => 1,
);

has 'html' => (
    is       => 'rw',
    isa      => 'Str',
);

has 'config_keys' => (
    is       => 'ro',
    isa      => 'ArrayRef[Str]',
    lazy     => 1,
    default  => sub {
        return [
            'sponsor_link',
            'sponsor_text',
        ];
    },
);

has 'aggregated_js' => (
    is       => 'rw',
    isa      => 'Str',
    lazy     => 1,
    default  => '',
);

has 'js_digest' => (
    is       => 'ro',
    isa      => 'Digest::MD5',
    lazy     => 1,
    default  => sub { Digest::MD5-> new; },
);

my %hash_cache;


sub write {
    my($class, $builder, $src_dir) = @_;

    my $dst_dir = $src_dir;
    $dst_dir =~ s{html$}{docroot};
    my $self = $class->new(
        builder => $builder,
        src_dir => $src_dir,
        dst_dir => $dst_dir,
    );

    $self->read_html();
    $self->process_javascript();
    $self->process_css();
    $self->copy_js_data_file();
    $self->copy_images();
    $self->insert_config();
    $self->write_html();
    $self->copy_other_files();
    $self->purge_old_files();
}


sub read_html {
    my($self) = @_;
    $self->html( $self->read_file('index.html') );
}


sub process_javascript {
    my($self) = @_;

    $self->builder->progress_message(" - minifying/aggregating Javascript");

    # First pass - work out what to do with each script tag
    my $html = $self->html;
    my $aggregated = 0;
    my %action;
    foreach my $js_src ( $html =~ m{^\s*<script[^>]*src="([^"]*)"}gm ) {
        if(my $url = $external_script{$js_src}) {
            $action{$js_src} = $url;
        }
        elsif($js_src =~ m{[.]min[.]js$}) {
            $self->aggregate_js($js_src);
            $action{$js_src} = $aggregated++ ? '[DELETE]' : '[AGGREGATE]';
        }
        else {
            $action{$js_src} = $self->minify_js($js_src);
        }
    }

    # Second pass - replace each script tag
    $html =~ s{^\s*<script[^>]*src="([^"]*)".*?\n}
              {$self->replacement_script_tag( $action{$1} )}egm;
    $self->html($html);
}


sub replacement_script_tag {
    my($self, $action) = @_;

    my $new_src = $action;
    if($action eq '[DELETE]') {
        return '';
    }
    elsif($action eq '[AGGREGATE]') {
        $new_src = $self->save_aggregated_js;
    }
    return qq{  <script type="text/javascript" src="$new_src"></script>\n};
}


sub aggregate_js {
    my($self, $js_src) = @_;
    my $js = $self->read_file($js_src);
    my $digest = $self->js_digest;
    $digest->add($js);
    my $aggregated_js = $self->aggregated_js . "/* $js_src */\n$js;\n\n";
    $self->aggregated_js($aggregated_js);
}


sub save_aggregated_js {
    my($self) = @_;
    my $digest = $self->js_digest;
    my $hash = substr( $digest->hexdigest, 0, 6 );
    return $self->write_file("static/sitelib-$hash.min.js", $self->aggregated_js);
}


sub minify_js {
    my($self, $js_src) = @_;
    my $js = $self->read_file($js_src);
    my $min_js = JavaScript::Minifier::XS::minify($js);
    my $hash = substr( Digest::MD5::md5_hex($js), 0, 6 );
    $js_src =~ s{(?=[.]js$)}{-$hash.min};
    return $self->write_file($js_src, $min_js);
}


sub process_css {
    my($self) = @_;

    $self->builder->progress_message(" - minifying/aggregating CSS");
    my $html = $self->html;
    $html =~ s{(<link rel="stylesheet"[^>]*href=")([^"]*)}
              { $1 . $self->minify_css($2) }eg;
    $self->html($html);
}


sub minify_css {
    my($self, $css_href) = @_;
    my $url = URI->new('http://host/' . $css_href);
    my $css = $self->slurp_css_file($url, $url);
    my $min_css = CSS::Minifier::XS::minify($css);
    my $hash = substr( Digest::MD5::md5_hex($css), 0, 6 );
    $css_href =~ s{(?=[.]css$)}{-$hash.min};
    return $self->write_file($css_href, $min_css);
}


sub slurp_css_file {
    my($self, $url, $css_url) = @_;
    my $css = $self->read_file( $url->path );
    my $imports = '';
    $css =~ s{\@import (.*?);}
             {
                 $imports .= $self->slurp_css_file(
                    URI->new_abs(_path_from_css_url($1), $url),
                    $css_url
                 ) . "\n\n";
                 "";
             }eg;
    $css =~ s{url\((.*?)\)}
             {
                 my $ref_url = URI->new_abs(_path_from_css_url($1), $url);
                 $ref_url = $ref_url->rel( $css_url )->as_string;
                 'url(' . $self->_hashify_css_url($ref_url) . ')';
             }eg;
    return $imports . $css;
}


sub _path_from_css_url {
    my($path) = @_;
    $path = _trim($path);
    $path =~ s{url\((.*?)\)}{$1};
    $path = _trim($path);
    $path =~ s{(['"])(.*?)\)\1}{$2};
    return $path;
}


sub _trim {
    my($str) = @_;
    $str =~ s{^\s+}{};
    $str =~ s{\s+$}{};
    return $str;
}


sub _hashify_css_url {
    my($self, $url_path) = @_;

    return $hash_cache{$url_path} if $hash_cache{$url_path};

    my $abs_path = File::Spec->catfile($self->src_dir, 'static', $url_path);
    return $url_path unless -e $abs_path;

    my $data = $self->read_file( 'static/' . $url_path );
    my $hash = substr( Digest::MD5::md5_hex($data), 0, 6 );
    my $new_path = $url_path;
    $new_path =~ s{(?=[.]\w+$)}{-$hash};

    $self->write_file('static/' . $new_path, $data);

    return $hash_cache{$url_path} = $new_path;
}


sub copy_js_data_file {
    my($self) = @_;
    my $src_path = 'cpan-map-data.txt';
    my $dst_path = $src_path;
    my $slug = $self->builder->slug_of_the_day;
    $dst_path =~ s{(?=[.]txt$)}{-$slug};
    $self->copy_file($src_path, $dst_path);
    my $html = $self->html;
    $html =~ s{\Q$src_path\E}{$dst_path};
    $self->html($html);
}


sub copy_images {
    my($self) = @_;

    $self->builder->progress_message(" - copying image files");
    my $src_dir = $self->src_dir;
    my @files = File::Find::Rule->name(qr{[.](gif|png|jpe?g|ico)$}i)->in($src_dir);
    foreach my $path (@files) {
        $path =~ s{\Q$src_dir\E}{};
        $self->copy_file($path);
    }
}


sub insert_config {
    my($self) = @_;

    my $builder = $self->builder;
    my $config = { };
    foreach my $key ( @{ $self->config_keys } ) {
        my $value = $builder->config_item($key);
        next unless defined $value;
        $config->{$key} = $value;
    }
    my $json = JSON::XS->new->ascii->pretty->encode($config);
    my $html = $self->html;
    $html =~ s{CpanMap\(.*?\)}{CpanMap($json)}s;
    $self->html($html);
}


sub write_html {
    my($self) = @_;

    $self->builder->progress_message(" - saving modified index.html");
    my $path = File::Spec->catfile($self->dst_dir, 'index.html');
    my $html = $self->html;
    $self->write_file('index.html', $html);
}


sub copy_other_files {
    my($self) = @_;
    chdir($self->src_dir) or die "chdir(" . $self->src_dir . "): $!";
    my @files = grep { $_ ne 'index.html' } glob('*.html'), glob('*.txt');
    foreach my $path ( @files ) {
        $self->copy_file($path);
    }
}


sub purge_old_files {
    my($self) = @_;
    $self->builder->progress_message(" - purging old generated files");
    chdir($self->dst_dir) or die "chdir(" . $self->dst_dir . "): $!";
    my @files = (glob('cpan-map-*-*.png'), glob('cpan-map-data-*.txt*'));
    foreach my $path ( @files ) {
        next if -M $path < 0.9; # Keep files less than a day old
        unlink($path);
    }
}


sub read_file {
    my($self, $path) = @_;
    my $src_path = File::Spec->catfile($self->src_dir, $path);
    local($/);
    open my $fh, '<', $src_path or die "open($src_path): $!";
    binmode($fh);
    return <$fh>;
}


sub write_file {
    my($self, $path, $data) = @_;
    $data //= '';
    my $dst_path = File::Spec->catfile($self->dst_dir, $path);
    my $dir_path = File::Basename::dirname($dst_path);
    File::Path::make_path($dir_path) unless -d $dir_path;
    open my $fh, '>', $dst_path or die "open(>$dst_path): $!";
    print $fh $data;
    close($fh);
    if(-s $dst_path && -T $dst_path) {
        gzip $dst_path => $dst_path . '.gz', -Level => 9
            or die "gzip failed: $GzipError\n";
    }
    return $path;
}


sub copy_file {
    my($self, $src, $dst) = @_;
    $dst ||= $src;
    $self->write_file( $dst, $self->read_file($src) );
}


__PACKAGE__->meta->make_immutable;


1;


