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
        app_title:    'Map of CPAN',
        map_data_url: 'cpan-map-data.json'
    };


    // Application globals

    var zoom_scale = [ 2, 3, 4, 5, 6, 8, 10 ];  // Must match CSS zoom*
    var scale      = 30;
    var map_margin = 50;
    var distros, mass_map;
    var dist_data, plane_rows, plane_cols;


    function build_app(app) {
        var $app      = $(app);
        var $zoom     = $('<ul class="map-zoom" />');
        var $viewport = $('<div class="map-viewport loading" />');
        $app.addClass('cpan-map');
        $app.append(
            $('<h1 />').text( $app.data('options').app_title ),
            $zoom,
            $viewport.html('<div class="init">Loading map data ...</div>')
        );
        $.ajax({
            url: 'cpan-map-data.json',
            dataType: 'json',
            success: function (data) { populate_map($app, data); }
        });
    }

    function populate_map($app, data) {
        var $viewport = $app.find('.map-viewport');
        mass_map   = data.mass_map;
        distros    = data.distros.data;
        plane_rows = data.distros.rows;
        plane_cols = data.distros.cols;
        var $plane = $('<table class="map-plane" />');

plane_rows = 8;
plane_cols = 8;
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
        set_zoom($app, 6);
    }

    function set_zoom($app, zoom) {
        var $plane = $app.find('.map-plane');
        var i = parseInt(zoom);
        scale = zoom_scale[i - 1];
        $plane.width(scale * plane_cols);
        for(var z = 1; z <= 5; z++) {
            $plane.removeClass('zoom' + z);
        }
        $plane.addClass('zoom' + zoom);
        size_viewport($app);
    }

    function dist_colour(dist) {
        var ns = dist.ns;
        var mass = mass_map[ns];
        if(mass) {
            return 'c' + mass.colour;
        }
        else {
            return 'c0';
        }
    }

    function size_viewport($app) {
        var $viewport = $app.find('.map-viewport');
        var plane  = plane_dimensions();
        var wrap   = $viewport.offset();
        var border = parseInt($viewport.css('border-left-width'));
        var width  = $(window).width() - (wrap.left * 2) - (border * 2);
        if(width > plane.width) {
            width = plane.width;
        }
        if(width < 100) {
            width = 100;
        }
        height = $(window).height() - wrap.top - 20;;
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
        var $viewport = $app.find('.map-viewport');
        var $plane    = $app.find('.map-plane');
        var wrap      = $viewport.offset();
        wrap.width    = $viewport.innerWidth();
        wrap.height   = $viewport.innerHeight();
        var plane     = plane_dimensions();
        $plane.draggable( 'option', 'containment', [
            wrap.left - (plane.width  + map_margin - wrap.width),
            wrap.top  - (plane.height + map_margin - wrap.height),
            wrap.left + map_margin,
            wrap.top  + map_margin
        ]);
    }

    function plane_dimensions() {
        return {
            width:  plane_cols * scale,
            height: plane_rows * scale
        };
    }

})(jQuery);


var old = function($) {

    $('ul#map-zoom li').click(function() {
        set_zoom($(this).text());
    });

}
