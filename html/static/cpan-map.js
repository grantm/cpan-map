/*
 * Map of CPAN
 * Copyright (c) 2011 Grant McLean <grant@mclean.net.nz>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(function($) {

    $.fn.cpan_map = function(options) {
        options = $.extend($.fn.cpan_map.defaults, options);
        $(this).each(function(x) {
            $(this).data('options', options);
            build_app(this);
        });

        return this;
    };

    $.fn.cpan_map.defaults = {
        app_title        : 'Map of CPAN',
        zoom_minus_label : 'Zoom map out',
        zoom_plus_label  : 'Zoom map in',
        map_data_url     : 'cpan-map-data.json',
        map_margin       : 50,
        zoom_scales      : [ 3, 4, 5, 6, 8, 10, 20 ]
    };


    // Application globals

    var meta      = {};
    var namespace = [];
    var distro    = [];
    var distro_at = [];

    function app_options($app) {
        return $app.data('options');
    }

    function build_app(app) {
        var $app      = $(app);
        var opt       = app_options($app);
        var $controls = $('<div class="map-controls" />');
        var $viewport = $('<div class="map-viewport loading" />');
        $app.addClass('cpan-map');
        $app.append(
            $('<h1 />').text( opt.app_title ),
            $controls,
            $viewport.html('<div class="init">Loading map data</div>')
        );
        $.ajax({
            url: 'cpan-map-data.txt',
            dataType: 'text',
            success: function (data) {
                var data_parser = make_data_parser(data);
                populate_map($app, data_parser);
            }
        });
    }

    function populate_map($app, data_parser) {
        var opt = app_options($app);
        parse_data($app, data_parser);
        var $viewport = $app.find('.map-viewport');
        var $plane = $('<div class="map-plane" />').css({
                        backgroundImage: 'url(' + meta.map_image + ')',
                        backgroundRepeat: 'no-repeat'
                     });

        $viewport.removeClass('loading');
        $viewport.html('');

        $viewport.append( $plane );
        $plane.draggable({ });
        add_controls($app);
        size_viewport($app, $viewport);
        set_initial_zoom($app);
    }

    function make_data_parser(data) {
        var i = 0;
        return function() {
            var j = data.indexOf("\n", i);
            if(j < 1) {
                data = null;
                return null;
            }
            var line = data.substring(i, j).split(",");
            i = j + 1;
            return line;
        }
    }

    function parse_data($app, next_record) {
        var rec, handler;
        var maint = [];

        var add_meta = function(rec) {
            meta[ rec[0] ] = rec[1];
        }

        var add_maint = function(rec) {
            maint.push( rec[0] );
        }

        var add_ns = function(rec) {
            var ns = {
                name: rec[0],
                colour: rec[1],
                mass: parseInt(rec[2], 16),
            }
            namespace.push( ns );
        }

        var add_distro = function(rec) {
            var row = parseInt(rec[3], 16);
            var col = parseInt(rec[4], 16);
            var dist = {
                name: rec[0],
                maintainer: maint[ parseInt(rec[2], 16) ],
                row: row,
                col: col
            }
            if(rec[1] != '') {
                ns = namespace[ parseInt(rec[1], 16) ];
                if(ns) {
                    dist.ns = ns.name;
                }
            }
            if(!distro_at[row]) {
                distro_at[row] = [];
            }
            distro_at[row][col] = distro.length;
            distro.push( dist );
        }

        while(rec = next_record()) {
            if(rec[0] == '[META]')          { handler = add_meta;   continue; }
            if(rec[0] == '[MAINTAINERS]')   { handler = add_maint;  continue; }
            if(rec[0] == '[NAMESPACES]')    { handler = add_ns;     continue; }
            if(rec[0] == '[DISTRIBUTIONS]') { handler = add_distro; continue; }
            if(handler) {
                handler(rec);
            }
        }

    }

    function size_viewport($app, $viewport) {
        var opt = app_options($app);
        var wrap   = $viewport.offset();
        var border = parseInt($viewport.css('border-left-width'));
        var width  = $(window).width() - (wrap.left * 2) - (border * 2);
        if(width < 100) {
            width = 100;
        }
        var height = $(window).height() - wrap.top - 20;;
        if(height < 100) {
            height = 100;
        }
        $viewport.width(width);
        $viewport.height(height);
    }

    function set_initial_zoom($app) {
        var opt = app_options($app);
        var $viewport = $app.find('.map-viewport');
        var width  = $viewport.width();
        var height = $viewport.height();
        var zoom_scales = opt.zoom_scales;
        for(var i = zoom_scales.length - 1; i > 0; i--) {
            if(
                zoom_scales[i] * meta.plane_cols < width
             && zoom_scales[i] * meta.plane_rows < height
            ) {
                return set_zoom($app, i);
            }
        }
        return set_zoom($app, 0);
    }

    function set_zoom($app, new_zoom) {
        var opt = app_options($app);
        var zoom_scales = opt.zoom_scales;
        if(new_zoom < 0) {
            new_zoom = 0;
        }
        if(new_zoom >= zoom_scales.length) {
            new_zoom = zoom_scales.length - 1;
        }
        if(new_zoom === opt.current_zoom) {
            return;
        }
        opt.current_zoom = new_zoom;
        opt.scale = zoom_scales[new_zoom];
        var $plane = $app.find('.map-plane');
        var i = parseInt(new_zoom);
        var width  = opt.scale * meta.plane_cols;
        var height = opt.scale * meta.plane_rows;
        $plane.width(width)
              .height(height)
              .css({ backgroundSize: width + 'px ' + height + 'px' });
    }

    function add_controls($app) {
        var opt = $app.data('options');
        var $zoom = $('<ul class="map-zoom" />');
        $app.find('.map-controls').append(
            $zoom.append(
                $('<li class="zoom-minus">-</li>')
                    .attr('title', opt.zoom_minus_label)
                    .click(function() { inc_zoom($app, -1) }),
                $('<li class="zoom-plus">+</li>')
                    .attr('title', opt.zoom_plus_label)
                    .click(function() { inc_zoom($app, 1) })
            )
        );
    }

    function plane_dimensions(opt) {
        return {
            width:  meta.plane_cols * opt.scale,
            height: meta.plane_rows * opt.scale
        };
    }

    function inc_zoom($app, inc) {
        var opt = app_options($app);
        set_zoom($app, opt.current_zoom + inc);
    }

})(jQuery);

