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
        zoom_scales      : [ 2, 3, 4, 5, 6, 8, 10 ]  // Must match CSS zoom*
    };


    // Application globals

    var distros, mass_map, plane_rows, plane_cols;


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
            $viewport.html('<div class="init">Loading map data ...</div>')
        );
        $.ajax({
            url: 'cpan-map-data.json',
            dataType: 'json',
            success: function (data) { populate_map($app, data); }
        });
    }

    function populate_map($app, data) {
        var opt = app_options($app);
        var $viewport = $app.find('.map-viewport');
        mass_map   = data.mass_map;
        distros    = data.distros.data;
        plane_rows = data.distros.rows;
        plane_cols = data.distros.cols;
        var $plane = $('<table class="map-plane" />');

        for(var i = 0; i < plane_rows; i++) {
            var $row = $('<tr />');
            for(var j = 0; j < plane_cols; j++) {
                var $cell = $('<td />')
                var dist = distros[i][j];
                if(dist) {
                    var cell_colour = dist_colour(dist);
                    $cell.attr('title', dist.name)
                         .addClass(cell_colour);
                }
                $row.append( $cell );
            }
            $plane.append($row);
        }

        $viewport.removeClass('loading');
        $viewport.html('');
        $viewport.append($plane);
        $plane.draggable({ });
        add_controls($app);
        auto_set_zoom($app);
    }

    function auto_set_zoom($app) {
        var opt = app_options($app);
        var $viewport = $app.find('.map-viewport');
        var wrap   = $viewport.offset();
        var border = parseInt($viewport.css('border-left-width'));
        var width  = $(window).width() - (wrap.left * 2) - (border * 2);
        var zoom_scales = opt.zoom_scales;
        for(var i = zoom_scales.length - 1; i > 0; i--) {
            if(zoom_scales[i] * plane_cols < width) {
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
        $plane.width(opt.scale * plane_cols);
        for(var z = 1; z < opt.zoom_scales.length; z++) {
            $plane.removeClass('zoom' + z);
        }
        $plane.addClass('zoom' + new_zoom);
        size_viewport($app);
    }

    function dist_colour(dist) {
        var ns   = dist.ns;
        var mass = mass_map[ns];
        if(mass) {
            return 'c' + mass.colour;
        }
        else {
            return 'c0';
        }
    }

    function size_viewport($app) {
        var opt = app_options($app);
        var $viewport = $app.find('.map-viewport');
        var plane  = plane_dimensions(opt);
        var wrap   = $viewport.offset();
        var border = parseInt($viewport.css('border-left-width'));
        var width  = $(window).width() - (wrap.left * 2) - (border * 2);
        if(width > plane.width) {
            width = plane.width;
        }
        if(width < 100) {
            width = 100;
        }
        var height = $(window).height() - wrap.top - 20;;
        if(height > plane.height) {
            height = plane.height;
        }
        if(height < 100) {
            height = 100;
        }
        $viewport.width(width);
        $viewport.height(height);
        reset_drag_range($app);
    }

    function reset_drag_range($app) {
        var opt = app_options($app);
        var $viewport = $app.find('.map-viewport');
        var $plane    = $app.find('.map-plane');
        var wrap      = $viewport.offset();
        wrap.width    = $viewport.innerWidth();
        wrap.height   = $viewport.innerHeight();
        var plane     = plane_dimensions(opt);
        $plane.draggable( 'option', 'containment', [
            wrap.left - (plane.width  + opt.map_margin - wrap.width),
            wrap.top  - (plane.height + opt.map_margin - wrap.height),
            wrap.left + opt.map_margin,
            wrap.top  + opt.map_margin
        ]);
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
            width:  plane_cols * opt.scale,
            height: plane_rows * opt.scale
        };
    }

    function inc_zoom($app, inc) {
        var opt = app_options($app);
        set_zoom($app, opt.current_zoom + inc);
    }

})(jQuery);

