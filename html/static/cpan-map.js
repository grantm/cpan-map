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
    var app_tmpl  = null;


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
            $('<div class="map-panel" />').append(
                $controls,
                $('<div class="map-info-panel" />'),
                $('<div class="map-separator" />'),
                $viewport.html('<div class="init">Loading map data</div>')
            )
        );
        $.ajax({
            url: 'cpan-map-data.txt',
            dataType: 'text',
            success: function (data) {
                var data_parser = make_data_parser(data);
                populate_map($app, data_parser);
            }
        });
        load_templates();
    }

    function load_templates() {
        if(app_tmpl != null) { return; }
        app_tmpl = {};
        app_tmpl.dist_info = _.template( $('#tmpl-dist-info').html() );
    }

    function populate_map($app, data_parser) {
        var opt = app_options($app);
        parse_data($app, data_parser);
        var $viewport = $app.find('.map-viewport');
        var $map_image = $('<img class="map" src="' + meta.map_image + '" />');
        var $plane = $('<div class="map-plane" />');

        $plane.append(
            $map_image,
            $('<div class="map-plane-sight" />')
        );

        $viewport.removeClass('loading');
        $viewport.html('');

        $viewport.append( $plane );
        add_controls($app);
        size_map_panel($app);
        set_initial_zoom($app);
        enable_plane_drag($app, $plane);
        attach_hover_handler($app, $plane);
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

    function size_map_panel($app) {
        var opt = app_options($app);
        var $panel = $app.find('.map-panel');
        var height = $(window).height() - 80;
        if(height < 300) {
            height = 300;
        }
        $app.height(height);
        var width  = $(window).width() - 40;
        if(width < 900) {
            $app.width(900);
        }
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
        $plane.width(width).height(height);
        $plane.find('img.map').width(width).height(height);
        $app.find('.map-plane-sight').css({
            width:  (opt.scale - 2) + 'px',
            height: (opt.scale - 2) + 'px'
        });
    }

    function add_controls($app) {
        var opt = $app.data('options');

        var $zoom = $('<ul class="map-zoom" />')
            .append(
                $('<li class="zoom-minus"><a>&ndash;</a></li>')
                    .attr('title', opt.zoom_minus_label)
                    .click(function() { inc_zoom($app, -1) }),
                $('<li class="zoom-plus"><a>+</a></li>')
                    .attr('title', opt.zoom_plus_label)
                    .click(function() { inc_zoom($app, 1) })
            );

        var $dist_inp  = $('<input class="map-hover-distro" value="" />');
        var $maint_inp = $('<input class="map-hover-maint" value="" />');

        var $controls = $app.find('.map-controls').append(
            $('<label>Zoom</label>'),
            $zoom,
            $('<label>Distro</label>'),
            $dist_inp,
            $('<label>Maintainer</label>'),
            $maint_inp
        );

        $dist_inp.width(0);
        var offset = $maint_inp.offset();
        var width = $controls.width() + 220 - offset.left - $maint_inp.width();
        $dist_inp.width(width);
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

    function enable_plane_drag($app, $plane) {
        var opt = app_options($app);
        opt.plane_drag_top  = 0;
        opt.plane_drag_left = 0;
        $plane.draggable({
            start: function(e, ui) {
                opt.dragging = true;
            },
            stop: function(e, ui) {
                opt.dragging = false;
                var pos = ui.position;
                opt.plane_drag_top  = pos.top;
                opt.plane_drag_left = pos.left;
            }
        });
    }

    function attach_hover_handler($app, $plane) {
        var opt = app_options($app);
        var cur_row = -1;
        var cur_col = -1;
        var offset  = $plane.offset();
        var $input_distro = $app.find('input.map-hover-distro');
        var $input_maint  = $app.find('input.map-hover-maint');
        var $plane_sight  = $app.find('.map-plane-sight');
        $plane.mousemove(function(e) {
            if(opt.dragging) { return; }
            col = Math.floor((e.pageX - offset.left - opt.plane_drag_left) / opt.scale);
            row = Math.floor((e.pageY - offset.top - opt.plane_drag_top) / opt.scale);
            if(row == cur_row && col == cur_col) { return; }
            cur_row = row;
            cur_col = col;
            $plane_sight.css({
                top:  (cur_row * opt.scale) + 'px',
                left: (cur_col * opt.scale) + 'px'
            });
            var dist = distro_at_row_col(row, col);
            if(dist) {
                $input_distro.val(dist.name);
                $input_maint.val(dist.maintainer);
            }
        });
        $plane.click(function(e) {
            if(cur_row < 0 || cur_col < 0) { return; }
            var dist = distro_at_row_col(row, col);
            if(dist) {
                get_dist_details($app, dist);
            }
        });
    }

    function distro_at_row_col(row, col) {
        if(distro_at[row]) {
            var i = distro_at[row][col];
            if(i !== null) {
                return distro[i];
            }
        }
        return null;
    }

    function get_dist_details($app, dist) {
        var $info_panel = $app.find('.map-info-panel');
        $info_panel.html('').addClass('loading');
        var dist_name = dist.name.replace(/::/g, '-');
        $.ajax({
            url: 'http://api.metacpan.org/release/' + dist_name,
            data: { application: 'cpan-map' },
            dataType: 'jsonp',
            success: function(data) { display_dist_details($app, data); },
            error: function() { $info_panel.removeClass('loading'); },
            timeout: 5000
        });
    }

    function display_dist_details($app, data) {
        if(!data.resources) { data.resources = null; }
        if(!data.abstract) { data.abstract = null; }
        if(!data.download_url) { data.download_url = null; }
        $app.find('.map-info-panel')
            .html( app_tmpl.dist_info(data) )
            .removeClass('loading');
    }

})(jQuery);

