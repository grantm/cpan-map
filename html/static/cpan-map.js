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
        zoom_scales      : [ 3, 4, 5, 6, 8, 10 ]
    };


    // Application globals

    var distros, mass_map, plane_rows, plane_cols, map_image, max_scale;


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
            success: function (data) { populate_map($app, data); }
        });
    }

    function populate_map($app, data) {
        var opt = app_options($app);
        var $viewport = $app.find('.map-viewport');
        plane_rows = 128;
        plane_cols = 192;
        max_scale  = 10;
        map_image  = 'cpan-map.png';
        var $plane = $('<div class="map-plane" />').css({
                        backgroundImage: 'url(' + map_image + ')',
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

    function size_viewport($app, $viewport) {
        var opt = app_options($app);
        var plane  = plane_dimensions(max_scale);
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
                zoom_scales[i] * plane_cols < width
             && zoom_scales[i] * plane_rows < height
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
        var width  = opt.scale * plane_cols;
        var height = opt.scale * plane_rows;
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
            width:  plane_cols * opt.scale,
            height: plane_rows * opt.scale
        };
    }

    function inc_zoom($app, inc) {
        var opt = app_options($app);
        set_zoom($app, opt.current_zoom + inc);
    }

})(jQuery);

