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

    var opt = {
        app_selector          : 'body',
        app_title             : 'Map of CPAN',
        zoom_minus_label      : 'Zoom map out',
        zoom_plus_label       : 'Zoom map in',
        map_data_url          : 'cpan-map-data.txt',
        ajax_release_url_base : 'http://api.metacpan.org/release/',
        zoom_scales           : [ 3, 4, 5, 6, 8, 10, 20 ]
    };

    var cpan = {  // Populated via build_app() call before Sammy.run is called
        meta       : {},
        maint      : [],
        namespace  : [],
        distro     : [],
        distro_num : {},
        distro_at  : []
    };

    var dim;

    var app = $.sammy(opt.app_selector, function() {

        this.use(Sammy.Template, 'tmpl');

        var template_cache = {};

        this.helper('update_info', function(selector, data) {
            var context = this;
            var html = context.tmpl(template_cache[selector], data);
            $('.map-info-panel').html(html).removeClass('loading');
        });

        this.bind('run', function(context, data) {
            var $el = this.$element();
            initialise_ui_elements($el);
            $(window).resize(function() { app.trigger('resize'); });
            $el.find('.zoom-plus').click( function() { app.trigger('increase_zoom'); });
            $el.find('.zoom-minus').click( function() { app.trigger('decrease_zoom'); });
            $('script[type="text/template"]').each(function(i, el) {
                template_cache['#' + el.id] = $(el).html();
            });
        });

        this.bind('resize', function(e) {
            size_controls( this.$element() );
        });

        this.bind('increase_zoom', function(e) {
            set_zoom(this.$element(), opt.current_zoom + 1);
        });

        this.bind('decrease_zoom', function(e) {
            set_zoom(this.$element(), opt.current_zoom - 1);
        });

        this.bind('distro_hover', function(e, distro) {
            var $el = this.$element();
            $el.find('input.map-hover-distro').val(distro.name);
            $el.find('input.map-hover-maint').val(distro.maintainer.id);
        });

        this.bind('distro_select', function(e, distro) {
            this.redirect('#/distro/' + distro.name);
        });

        this.get('#/', function(context) {
            this.update_info('#tmpl-home', cpan.meta);
        });

        this.get('#/distro/:name', function(context) {
            var context = this;
            var $el = this.$element();
            $el.find('.map-info-panel').html('').addClass('loading');
            ajax_load_distro_detail( this.params['name'], function(distro) {
                context.update_info('#tmpl-distro', distro);
            });
        });


        // Utility functions used by the app

        function initialise_ui_elements($el) {

            $el.find('.map-panel').removeClass('loading');
            $el.find('.map-viewport').html('').append(
                $('<div class="map-plane" />').append(
                    $('<img class="map" src="' + cpan.meta.map_image + '" />'),
                    $('<div class="map-plane-sight" />')
                )
            );

            $el.find('.map-controls').append(
                $('<label>Zoom</label>'),
                $('<ul class="map-zoom" />') .append(
                    $('<li class="zoom-minus"><a>&ndash;</a></li>')
                        .attr('title', opt.zoom_minus_label),
                    $('<li class="zoom-plus"><a>+</a></li>')
                        .attr('title', opt.zoom_plus_label)
                ),
                $('<label>Distro</label>'),
                $('<input class="map-hover-distro" value="" />').width(0),
                $('<label>Maintainer</label>'),
                $('<input class="map-hover-maint" value="" />').width(0)
            );

            size_controls($el);
            set_initial_zoom($el);
            enable_plane_drag($el);
            attach_hover_handler($el);
        }

        function size_controls($el) {
            var padding = parseInt( $el.css('paddingLeft') );

            var app_height = $(window).height() - padding * 2;
            if(app_height < 300) {
                app_height = 300;
            }
            $el.height(app_height);

            var app_width  = $(window).width() - padding * 2;
            if(app_width < 800) {
                app_width = 800;
            }
            $el.width(app_width);

            var $panel = $el.find('.map-info-panel');
            var panel_height = app_height - parseInt( $panel.css('top') );
            $panel.height( panel_height );
            $el.find('.map-separator').height( panel_height );

            var $controls = $el.find('.map-controls');
            var $input1 = $controls.find('.map-hover-distro');
            var $input2 = $controls.find('.map-hover-maint');
            if(!dim) {
                dim = { info_width: 200 };
                dim.controls_base_width =
                    $input2.offset().left - $controls.offset().left;
            }
            var inp_width = app_width - dim.info_width - 16 - dim.controls_base_width;
            if(inp_width < 250) {
                inp_width = 250;
            }
            $input1.width( Math.floor(inp_width * 3 / 5) );
            $input2.width( Math.floor(inp_width * 2 / 5) );
        }

        function set_initial_zoom($el) {
            var $viewport = $el.find('.map-viewport');
            var width  = $viewport.width();
            var height = $viewport.height();
            var zoom_scales = opt.zoom_scales;
            for(var i = zoom_scales.length - 1; i > 0; i--) {
                if(
                    zoom_scales[i] * cpan.meta.plane_cols < width
                 && zoom_scales[i] * cpan.meta.plane_rows < height
                ) {
                    return set_zoom($el, i);
                }
            }
            return set_zoom($el, 0);
        }

        function set_zoom($el, new_zoom) {
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
            var $plane = $el.find('.map-plane');
            var i = parseInt(new_zoom);
            var width  = opt.scale * cpan.meta.plane_cols;
            var height = opt.scale * cpan.meta.plane_rows;
            $plane.width(width).height(height);
            $plane.find('img.map').width(width).height(height);
            $el.find('.map-plane-sight').css({
                width:  (opt.scale - 2) + 'px',
                height: (opt.scale - 2) + 'px'
            });
        }

        function enable_plane_drag($el) {
            var $plane = $el.find('.map-plane');
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

        function attach_hover_handler($el) {
            var $plane = $el.find('.map-plane');
            var cur_row = -1;
            var cur_col = -1;
            var offset  = $plane.offset();
            var $plane_sight  = $el.find('.map-plane-sight');
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
                var distro = distro_at_row_col(row, col);
                if(distro) {
                    app.trigger('distro_hover', distro);
                }
            });
            $plane.click(function() {
                if(cur_row < 0 || cur_col < 0) { return; }
                var distro = distro_at_row_col(row, col);
                if(distro) {
                    app.trigger('distro_select', distro);
                }
            });
        }

        function distro_at_row_col(row, col) {
            if(cpan.distro_at[row]) {
                var i = cpan.distro_at[row][col];
                if(i !== null) {
                    return cpan.distro[i];
                }
            }
            return null;
        }

        function ajax_load_distro_detail(distro_name, handler) {
            var i = cpan.distro_num[ distro_name ];
            if(i === null) { return; }
            var distro = cpan.distro[i];
            if(distro == null) { return; }
            var release_name = distro.name.replace(/::/g, '-');
            if(distro.meta) {  //  Data is in cache already
                handler(distro);
                return;
            }
            $.ajax({
                url: opt.ajax_release_url_base + release_name,
                data: { application: 'cpan-map' },
                dataType: 'jsonp',
                success: function(data) {
                    distro.meta = data;
                    handler(distro);
                },
                error: function() { $info_panel.removeClass('loading'); },
                timeout: 5000
            });
        }

    });


    // On document ready, Add the required UI elements, download the CPAN
    // metadata and then launch the Sammy application.

    $(function() {

        function build_app($el, run_app) {
            var $controls = $('<div class="map-controls" />');
            var $viewport = $('<div class="map-viewport" />');
            $el.addClass('cpan-map');
            $el.append(
                $('<h1 />').text( opt.app_title ),
                $('<div class="map-panel loading" />').append(
                    $controls,
                    $('<div class="map-info-panel" />'),
                    $('<div class="map-separator" />'),
                    $viewport.html('<div class="init">Loading map data</div>')
                )
            );
            $.ajax({
                url: opt.map_data_url,
                dataType: 'text',
                success: function (data) {
                    var parser = make_data_parser(data);
                    parse_data(parser);
                    run_app();
                }
            });
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

        function parse_data(next_record) {
            var rec, handler;

            var add_meta = function(rec) {
                cpan.meta[ rec[0] ] = rec[1];
            }

            var add_maint = function(rec) {
                cpan.maint.push({
                    id: rec[0]
                });
            }

            var add_ns = function(rec) {
                cpan.namespace.push({
                    name: rec[0],
                    colour: rec[1],
                    mass: parseInt(rec[2], 16),
                });
            }

            var add_distro = function(rec) {
                var row = parseInt(rec[3], 16);
                var col = parseInt(rec[4], 16);
                var distro = {
                    name: rec[0],
                    maintainer: cpan.maint[ parseInt(rec[2], 16) ],
                    row: row,
                    col: col
                }
                if(rec[1] != '') {
                    ns = cpan.namespace[ parseInt(rec[1], 16) ];
                    if(ns) {
                        distro.ns = ns.name;
                    }
                }
                if(!cpan.distro_at[row]) {
                    cpan.distro_at[row] = [];
                }
                cpan.distro_at[row][col] = cpan.distro.length;
                cpan.distro_num[distro.name] = cpan.distro.length;
                cpan.distro.push( distro );
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

        build_app(
            $(opt.app_selector),
            function() { app.run('#/'); }
        );

    });

})(jQuery);
