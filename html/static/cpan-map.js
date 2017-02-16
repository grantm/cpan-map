/*
 * Map of CPAN
 * Copyright (c) 2011-2014 Grant McLean <grantm@cpan.org>
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

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true, strict:true, undef:true, curly:true, browser:true, indent:4, eqnull:true, maxerr:100, white:false */
/*global jQuery:true, Sammy:true */


(function($) {
    'use strict';

    // var api_server_base_url = 'http://api.metacpan.org/v0';
    var api_server_base_url = 'https://fastapi.metacpan.org/v1';
    var opt = {
        app_selector          : 'body',
        app_title             : 'Map of CPAN',
        intro_title           : 'Welcome to the Map of CPAN',
        zoom_minus_label      : 'Zoom map out',
        zoom_plus_label       : 'Zoom map in',
        map_data_url          : 'cpan-map-data.txt',
        stats_domain          : 'mapofcpan.org',
        start_ticker          : true,
        ajax_query_url_base   : api_server_base_url,
        ajax_release_url_base : api_server_base_url + '/release/',
        ajax_author_url_base  : api_server_base_url + '/author/',
        ajax_module_url_base  : api_server_base_url + '/module/',
        ajax_pod_url_base     : api_server_base_url + '/pod/',
        ajax_source_url_base  : api_server_base_url + '/source/',
        ajax_recent_updates   : api_server_base_url + '/author/_search?' +
                                'q=updated:*&sort=updated:desc&fields=pauseid,name,updated&size=50',
        rt_dist_url           : 'https://rt.cpan.org/Public/Dist/Display.html?Name=',
        avatar_url_template   : 'http://www.gravatar.com/avatar/%ID%?s=80&d=%DEFAULT_URL%',
        default_avatar        : 'static/images/no-photo.png'
    };

    var social_links = {
        'github'             : 'https://github.com/%ID%',
        'twitter'            : 'http://twitter.com/%ID%',
        'perlmonks'          : 'http://www.perlmonks.org/?node=%ID%',
        'ohloh'              : 'https://www.ohloh.net/accounts/%ID%',
        'stackoverflow'      : 'http://stackoverflow.com/users/%ID%/',
        'coderwall'          : 'http://www.coderwall.com/%ID%',
        'geeklist'           : 'http://geekli.st/%ID%',
        'github-meets-cpan'  : 'http://github-meets-cpan.com/user/%ID%',
        'googleplus'         : 'http://plus.google.com/%ID%',
        'lastfm'             : 'http://www.last.fm/user/%ID%',
        'linkedin'           : 'http://www.linkedin.com/in/%ID%',
        'prepan'             : 'http://prepan.org/user/%ID%',
        'slideshare'         : 'http://www.slideshare.net/%ID%',
        'facebook'           : 'https://facebook.com/%ID%',
        'flickr'             : 'http://www.flickr.com/people/%ID%/',
        'youtube'            : 'http://www.youtube.com/user/%ID%',
        'gitorious'          : 'https://gitorious.org/~%ID%',
        'tumblr'             : 'http://%ID%.tumblr.com/',
        'bitbucket'          : 'http://bitbucket.org/%ID%',
        'reddit'             : 'http://www.reddit.com/user/%ID%',
        'digg'               : 'http://digg.com/%ID%',
        'sourceforge'        : 'http://sourceforge.net/users/%ID%',
        'vimeo'              : 'http://vimeo.com/%ID%',
        'pinboard'           : 'http://pinboard.in/u:%ID%',
        'speakerdeck'        : 'https://speakerdeck.com/u/%ID%'
    };

    var cpan = {  // Populated via build_app() call before Sammy.run is called
        meta       : {},
        maint      : [],
        maint_num  : {},
        namespace  : [],
        distro     : [],
        distro_num : {},
        distro_at  : [],
        highlights : [],
        distro_for_module : {}
    };

    var query_cache = {};
    var dim;

    var app = $.sammy(opt.app_selector, function() {

        this.use(Sammy.Template, 'tmpl');
        this.use(Sammy.Title);

        var template_cache = {};

        this.helper('loading', function() {
            this.$element().find('.map-info-panel').html('')
                .addClass('loading').removeClass('loaded');
            return this;
        });

        this.helper('update_info', function(selector, heading, data) {
            var $el = this.$element();
            var context = this;
            var header = '';
            if(heading) {
                var $div = $('<div />').append(
                    $('<h1 class="info-title" />').text(heading),
                    $('<a class="back-button" />').attr('title', 'Back')
                );
                header = $div.html();
            }
            var html = context.tmpl(template_cache[selector], data);
            var $panel = $el.find('.map-info-panel');
            $panel.html(header).append(html).removeClass('loading').addClass('loaded');
            size_info_pane_content($panel);
            $panel.find('div.avatar img').load(function() {
                $(this).addClass('loaded');
            });
            if(typeof(history.length) !== 'undefined' && history.length > 1) {
                $panel.find('a.back-button').click(function() { window.history.go(-1); });
            }
            else {
                $panel.find('a.back-button').attr('href', '#/');
            }
            return context;
        });

        this.helper('not_implemented', function() {   // TODO: unimplement
            var context = this;
            var html = '<div class="not-impl"><h2>Sorry &#9785;</h2>' +
                       '<p>This feature is not yet implemented.</p></div>';
            $('.map-info-panel').html(html).removeClass('loading');
            return context;
        });

        this.helper('set_highlights', function(highlights) {
            cpan.highlights = highlights;
            this.trigger('show_highlights');
            return this;
        });

        this.bind('run', function(context, data) {
            var $el = this.$element();
            initialise_ui_elements($el);
            $(window).resize(function() { app.trigger('resize'); });
            $el.find('.zoom-plus').click( function() { app.trigger('increase_zoom'); });
            $el.find('.zoom-minus').click( function() { app.trigger('decrease_zoom'); });
            $el.find('label.ctrl-zoom').click(function() {
                set_initial_zoom($el);
                center_map($el);
            });
            $el.find('.map-plane-sight').mousewheel( function(e, delta) {
                app.trigger(delta < 0 ? 'decrease_zoom' : 'increase_zoom', true);
            });
            $el.find('.map-hover-maint').autocomplete({
                source: autocomplete_maint_name,
                select: function(event, ui) {
                    $(this).val(ui.item.value);
                    $el.find('.form-maint').submit();
                }
            });
            $el.find('.map-hover-distro').autocomplete({
                source: autocomplete_distro_name,
                select: function(event, ui) {
                    $(this).val(ui.item.value);
                    $el.find('.form-distro').submit();
                }
            });
            $('script[type="text/template"]').each(function(i, el) {
                template_cache['#' + el.id] = $(el).html();
            });
            if(opt.start_ticker) {
                ajax_load_recent_uploads( function(data) {
                    build_ticker($el, data.distro_list);
                });
            }
        });

        this.bind('ajax_load_failed', function(e) {
            this.update_info('#tmpl-ajax-error', 'AJAX Load Failed');
            return this;
        });

        this.bind('not_found', function(e, what) {
            this.update_info('#tmpl-not-found', '404 Not Found', { 'what' : what })
                .title('Not Found | ' + opt.app_title);
            return this;
        });

        this.bind('resize', function(e) {
            size_controls( this.$element() );
        });

        this.bind('increase_zoom', function(e, recenter) {
            set_zoom(this.$element(), opt.current_zoom + 1, recenter);
        });

        this.bind('decrease_zoom', function(e, recenter) {
            set_zoom(this.$element(), opt.current_zoom - 1, recenter);
        });

        this.bind('separator_moved', function(e) {
            var pos = opt.sep_pos;
            var $el = this.$element();
            $el.find('.map-info-panel').width(pos);
            $el.find('.map-panel').css({'padding-left': (pos + 10) + 'px'});
            this.trigger('resize');
        });

        this.bind('distro_hover', function(e, distro) {
            var $el = this.$element();
            $el.find('input.map-hover-distro').val(distro.name);
            var maint = distro.maintainer.id;
            if(distro.maintainer.name) {
                maint = maint + ' - ' + distro.maintainer.name;
            }
            $el.find('input.map-hover-maint').val(maint);
        });

        this.bind('distro_select', function(e, distro) {
            this.redirect('#/distro/' + distro.name);
        });

        this.bind('show_highlights', function(e) {
            highlight_distros(this.$element().find('div.map-highlights'));
        });

        this.get('#/', function(context) {
            var $el = this.$element();
            this.update_info('#tmpl-home', null, cpan.meta)
                .set_highlights([])
                .title(opt.app_title);
            $el.find('.map-info-panel').removeClass('loaded');
            $el.find('a.show-intro').click( show_intro_dialog );
        });

        this.get('#/sights', function(context) {
            context.update_info('#tmpl-sights', 'Sightseeing Tours')
                   .set_highlights([])
                   .title('Sightseeing Tours | ' + opt.app_title);
        });

        this.get('#/sights/distro-counts', function(context) {
            var maints = top_maintainters_by_distro();
            context.update_info('#tmpl-distro-counts', 'Maintainer Distro Counts', { 'maints' : maints })
                   .set_highlights([])
                   .title('Maintainer distro counts | ' + opt.app_title);
        });

        this.get('#/sights/favorites-leaderboard', function(context) {
            this.loading();
            ajax_load_favorites_leaderboard( function(data) {
                context.set_highlights(data.highlights)
                       .update_info('#tmpl-favorites-leaderboard', '++ Top 100', data)
                       .title('++ Top 100 Leaderboard | ' + opt.app_title);
            });
        });

        this.get('#/sights/recent-favorites', function(context) {
            this.loading();
            ajax_load_recent_favorites( function(data) {
                context.set_highlights(data.highlights)
                       .update_info('#tmpl-recent-favorites', 'Recent Favorites', data)
                       .title('Recent Favorites | ' + opt.app_title);
            });
        });

        this.get('#/sights/recent-uploads', function(context) {
            this.loading();
            ajax_load_recent_uploads( function(data) {
                context.set_highlights(data.highlights)
                       .update_info('#tmpl-recent-uploads', 'Recent Uploads', data)
                       .title('Recent Uploads | ' + opt.app_title);
            });
        });

        this.get('#/sights/profile-updates', function(context) {
            this.loading();
            ajax_load_profile_updates( function(data) {
                context.set_highlights([])
                       .update_info('#tmpl-profile-updates', 'Recent Profile Updates', data)
                       .title('Recent Profile Updates | ' + opt.app_title);
            });
        });

        this.get('#/distro/:name', function(context) {
            this.loading();
            ajax_load_distro_detail( this.params.name, function(distro) {
                context.set_highlights([ distro.index ])
                       .update_info('#tmpl-distro', distro.name, distro)
                       .title(distro.name + ' | ' + opt.app_title);
                $("p.pod-link").click(function() { show_pod_dialog(distro); });
                $("p.changes-link").click(function() { show_changes_dialog(distro); });
                $(".dep-graph-link").click(function() { show_dependency_graph(distro); });
            });
        });

        this.get('#/distro/:name/deps', function(context) {
            this.loading();
            ajax_load_distro_dependencies( this.params.name, function(distro) {
                context.set_highlights(distro.dep_highlights)
                       .update_info('#tmpl-deps', 'Dependencies', distro)
                       .title('Dependencies | ' + distro.name + ' | ' + opt.app_title);
            });
        });

        this.get('#/distro/:name/rdeps', function(context) {
            var $el = this.$element();
            this.loading();
            ajax_load_distro_reverse_deps( this.params.name, function(distro) {
                context.set_highlights(distro.rdep_highlights)
                       .update_info('#tmpl-rdeps', 'Reverse Dependencies', distro)
                       .title('Reverse Dependencies | ' + distro.name + ' | ' + opt.app_title);
                $el.find('table.reverse-dependencies').tablesorter({
                    sortList: [[0,0]]
                });
            });
        });

        this.get('#/module/:name', function(context) {
            this.loading();
            var mod_name = this.params.name;
            context.title('Distribution lookup for ' + mod_name + ' | ' + opt.app_title);
            ajax_map_module_to_distro(mod_name, function(distro_name) {
                if(distro_name) {
                    location.replace('#/distro/' + distro_name);
                }
                else {
                    context.trigger('not_found', 'a distribution containing the module "' + mod_name + '"');
                }
            });
        });

        this.get('#/maint/:cpanid', function(context) {
            this.loading();
            var cpanid  = this.params.cpanid;
            var distros = highlight_distros_for_maint(context, cpanid);
            ajax_load_maint_detail(cpanid, function(maint) {
                var data = {
                    'maint'   : maint,
                    'distros' : distros
                };
                context.update_info('#tmpl-maint', maint.name, data)
                       .title(maint.name + ' | ' + opt.app_title);
                if(maint.dates_loaded) {
                    display_maintainer_distro_list(maint, distros);
                }
                else {
                    ajax_load_maintainer_distro_dates(maint, distros);
                }
            });
        });

        this.post('#/search/distro', function(context) {
            var name = (this.params.distro || '').trim();
            this.redirect('#/distro/' + name);
            return false;
        });

        this.post('#/search/maint', function(context) {
            var name = (this.params.maint || '').toUpperCase().trim().replace(/\s.*$/, '');
            this.redirect('#/maint/' + name);
            return false;
        });

        // Final 'catch all' route - display a 404 page
        this.any(/^/, function(context) {
            if(window.location.hash.length > 0) {
                this.update_info('#tmpl-404', '404 Not Found', { 'hash_path' : window.location.hash})
                    .$element().find('.map-info-panel').removeClass('loading');
            }
            else {
                location.replace('#/');
            }
        });

        // Log page view stats - if enabled on this domain

        if(!opt.stats_domain || (opt.stats_domain === document.location.host)) {
            this.after(function() {
                var path = document.location.hash.substring(1, 1000);
                log_page_view({'path': path});
            });
        }


        // Utility functions used by the app

        function initialise_ui_elements($el) {

            var $plane = $('<div class="map-plane" />');
            add_map_images($plane);

            $el.find('.map-panel').removeClass('loading');
            $el.find('.map-viewport').html('').append(
                $plane.append(
                    $('<div class="map-highlights" />'),
                    $('<div class="map-plane-sight" />')
                )
            );

            $el.find('.map-controls').append(
                $('<label class="ctrl-zoom" title="Click to reset">Zoom</label>'),
                $('<ul class="map-zoom" />') .append(
                    $('<li class="zoom-minus"><a>&ndash;</a></li>')
                        .attr('title', opt.zoom_minus_label),
                    $('<li class="zoom-plus"><a>+</a></li>')
                        .attr('title', opt.zoom_plus_label)
                ),
                $('<form class="form-distro" action="#/search/distro" method="POST" />').append(
                    $('<label class="ctrl-distro">Distro</label>'),
                    $('<input class="map-hover-distro" name="distro" value="" />').width(1),
                    $('<a class="clearbutton" title="Click to clear" />')
                ),
                $('<form class="form-maint" action="#/search/maint" method="POST" />').append(
                    $('<label class="ctrl-maint">Maintainer</label>'),
                    $('<input class="map-hover-maint" name="maint" value="" />').width(1),
                    $('<a class="clearbutton" title="Click to clear" />')
                ),
                $('<span class="map-controls-end" />')
            );

            $el.find(".clearbutton").click(function(){
                $(this).parent().find("input").val('').focus();
            });

            opt.sep_pos = parseInt( $el.find('.map-separator').css('left'), 10 );

            size_controls($el);
            set_initial_zoom($el);
            center_map($el);
            enable_plane_drag($el);
            enable_separator_drag($el);
            attach_hover_handler($el);
            initialise_intro_dialog();
            initialise_misc_dialog();
        }

        function add_map_images($plane) {
            var map_url = cpan.meta.map_image;
            var slug    = '-' + cpan.meta.slug_of_the_day;
            var scales  = cpan.meta.zoom_scales;
            for(var i = 0; i < scales.length; i++) {
                var z = scales[i];
                var url = map_url.replace(/[.]png$/, '-' + z + slug + '.png');
                $plane.append(
                    $('<img src="' + url + '" class="map zoom' + i + '" />')
                    .width(opt.cols * z)
                    .height(opt.rows * z)
                );
            }
        }

        function size_controls($el) {
            var padding = parseInt( $el.css('paddingLeft'), 10 );

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

            var $controls = $el.find('.map-controls');
            var $panel = $el.find('.map-info-panel');
            var panel_height = app_height - ($panel.offset().top - $controls.offset().top);
            $panel.height( panel_height );
            size_info_pane_content($panel);

            $el.find('.map-separator').height( panel_height );
            var pos = opt.sep_pos;
            $el.find('.map-viewport').height( panel_height )
                                     .width(app_width - pos - 10);

            var $input1 = $controls.find('.map-hover-distro');
            var $input2 = $controls.find('.map-hover-maint');
            if(!dim) {
                var $end = $controls.find('.map-controls-end');
                dim = { };
                dim.controls_base_width =
                    $end.offset().left - $controls.offset().left;
            }
            var inp_width = app_width - dim.controls_base_width;
            if(inp_width < 250) {
                inp_width = 250;
            }
            $input1.width( Math.floor(inp_width / 2) );
            $input2.width( Math.floor(inp_width / 2) );
        }

        function size_info_pane_content($panel) {
            var height = parseInt( $panel.height(), 10 );
            height = height - 34;
            $panel.find('div.info').height(height);
        }

        function set_initial_zoom($el) {
            var $viewport = $el.find('.map-viewport');
            var width  = $viewport.width();
            var height = $viewport.height();
            var zoom_scales = cpan.meta.zoom_scales;
            for(var i = zoom_scales.length - 1; i > 0; i--) {
                if(
                    zoom_scales[i] * cpan.meta.plane_cols < width &&
                    zoom_scales[i] * cpan.meta.plane_rows < height
                ) {
                    return set_zoom($el, i);
                }
            }
            set_zoom($el, 0);
        }

        function center_map($el) {
            var $viewport = $el.find('.map-viewport');
            var width  = $viewport.width();
            var height = $viewport.height();

            var pwidth = cpan.meta.plane_cols * opt.scale;
            if(pwidth < width) {
                var xoffset = (width - pwidth) / 2;
                $el.find('.map-plane').css({left: xoffset + 'px'});
            }

            var pheight = cpan.meta.plane_rows * opt.scale;
            var yoffset = 0;
            if(pheight < height) {
                yoffset = (height - pheight) / 2;
            }
            $el.find('.map-plane').css({top: yoffset + 'px'});
        }

        function set_zoom($el, new_zoom, recenter) {
            var zoom_scales = cpan.meta.zoom_scales;
            var centering;
            if(new_zoom < 0) {
                new_zoom = 0;
            }
            if(new_zoom >= zoom_scales.length) {
                new_zoom = zoom_scales.length - 1;
            }
            if(new_zoom === opt.current_zoom) {
                return;
            }
            if(recenter && typeof(opt.current_zoom) !== 'undefined') {
                centering = save_centering($el);
            }
            opt.current_zoom = new_zoom;
            opt.scale = zoom_scales[new_zoom];
            var $plane = $el.find('.map-plane');

            for(var z = 0; z < zoom_scales.length; z++) {
                $plane.removeClass('zoom' + z);
            }
            $plane.addClass('zoom' + new_zoom);

            var i = parseInt(new_zoom, 10);
            var width  = opt.scale * cpan.meta.plane_cols;
            var height = opt.scale * cpan.meta.plane_rows;
            $plane.width(width).height(height);
            $el.find('.map-plane-sight').css({
                width:  (opt.scale - 2) + 'px',
                height: (opt.scale - 2) + 'px'
            });
            if(centering) {
                apply_centering($el, centering);
            }
            app.trigger('show_highlights');
        }

        function save_centering($el) {
            var $plane = $el.find('.map-plane');
            var $sight = $el.find('.map-plane-sight');
            var half_scale = Math.floor( opt.scale / 2 );
            var plane_x = parseInt( $plane.css('left'), 10 );
            var plane_y = parseInt( $plane.css('top'), 10 );
            var sight_x = parseInt( $sight.css('left'), 10 );
            var sight_y = parseInt( $sight.css('top'), 10 );
            return {
                row: Math.floor( sight_y / opt.scale ),
                col: Math.floor( sight_x / opt.scale ),
                viewport_x: plane_x + sight_x + half_scale,
                viewport_y: plane_y + sight_y + half_scale
            };
        }

        function apply_centering($el, centering) {
            var half_scale = Math.floor( opt.scale / 2 );
            var sight_x = centering.col * opt.scale;
            var sight_y = centering.row * opt.scale;
            var plane_x = centering.viewport_x - sight_x - half_scale;
            var plane_y = centering.viewport_y - sight_y - half_scale;
            $el.find('.map-plane').css({
                left: plane_x + 'px',
                top:  plane_y + 'px'
            });
            $el.find('.map-plane-sight').css({
                left: centering.col * opt.scale + 'px',
                top:  centering.row * opt.scale + 'px'
            });
        }

        function enable_plane_drag($el) {
            var $plane = $el.find('.map-plane');
            $plane.draggable({
                distance: 4,
                start: function(e, ui) {
                    opt.dragging = true;
                },
                stop: function(e, ui) {
                    opt.dragging = false;
                }
            });
        }

        function enable_separator_drag($el) {
            var left_margin = $el.find('.map-panel').offset().left;
            var $sep = $el.find('.map-separator');
            $sep.draggable({
                axis: 'x',
                containment: [left_margin, 0, 500, 0],
                drag: function(e, ui) {
                    var new_pos = ui.offset.left - left_margin;
                    if(opt.sep_pos !== new_pos) {
                        opt.sep_pos = new_pos;
                        app.trigger('separator_moved');
                    }
                }
            });
        }

        function attach_hover_handler($el) {
            var $plane = $el.find('.map-plane');
            var cur_row = -1;
            var cur_col = -1;
            var $plane_sight  = $el.find('.map-plane-sight');
            $plane.mousemove(function(e) {
                if(opt.dragging) { return; }
                var offset  = $plane.offset();
                var voffset = $el.find('.map-viewport').offset();
                var col = Math.floor((e.pageX - offset.left) / opt.scale);
                var row = Math.floor((e.pageY - offset.top) / opt.scale);
                if(row === cur_row && col === cur_col) { return; }
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
                var distro = distro_at_row_col(cur_row, cur_col);
                if(distro) {
                    app.trigger('distro_select', distro);
                }
            });
        }

        function initialise_intro_dialog() {
            $('#intro').dialog({
                autoOpen: false,
                closeOnEscape: true,
                draggable: false,
                resizable: false,
                show: "slide",
                modal: true,
                title: opt.intro_title,
                buttons: { "Close": function() { $(this).dialog("close"); } }
            });
        }

        function show_intro_dialog() {
            var dlg_height = $(window).height() - 100;
            var dlg_width  = $(window).width()  - 100;
            if(dlg_width > 800) { dlg_width = 800; }
            $('#intro').dialog( "option", {
                "height" : dlg_height,
                "width"  : dlg_width
            }).dialog('open');
        }

        function initialise_misc_dialog() {
            var pod_div = $('<div id="misc-dialog" />');
            $("body").append(pod_div);
            $('#misc-dialog').dialog({
                autoOpen: false,
                closeOnEscape: true,
                draggable: false,
                resizable: false,
                show: "slide",
                modal: true,
                buttons: { "Close": function() { $(this).dialog("close"); } }
            });
            $('#misc-dialog').on('click', 'a', function(event){
                var target = $(this).attr("href");
                if(target.substr(0, 1) === '#') {
                    $('#misc-dialog').scrollTo(target, 200);
                    event.preventDefault();
                    return false;
                }
            });
        }

        function show_pod_dialog(distro) {
            var main_module = distro.main_module || distro.name;
            $('#misc-dialog').dialog( "option", {
                title: "POD for " + main_module
            });
            var header_html = '<div class="pod-header"><a id="_POD_TOP_"></a>metacpan.org ' +
                '<span class="sep">&#9656;</span> ' +
                '<a href="https://metacpan.org/author/' + distro.maintainer.id +
                '" title="Maintainer">' + distro.maintainer.name + '</a> ' +
                '<span class="sep">&#9656;</span> ' +
                '<a href="https://metacpan.org/release/' + distro.dname +
                '" title="Distribution">' + distro.dname + '</a> ' +
                '<span class="sep">&#9656;</span> ' +
                '<a href="https://metacpan.org/module/' + main_module +
                '" title="Module">' + main_module + '</a></div>';
            $('#misc-dialog').html(header_html + '<p>Loading...</p>');
            $.ajax({
                url: opt.ajax_pod_url_base + main_module,
                dataType: 'html',
                success: function (pod_html) {
                    $('#misc-dialog').html(header_html + pod_html);
                    $('#misc-dialog').find('h1,h2,h3,dt').append(
                        '&nbsp;<a href="#_POD_TOP_" class="pod-top" title="Scroll to top">&#9652;</a>'
                    );
                },
                error: function() {
                    $('#misc-dialog').html(header_html + '<p>Failed to load POD.</p>');
                },
                timeout: 10000
            });
            open_misc_dialog();
            log_page_view({'pod': distro.name});
        }

        function show_changes_dialog(distro) {
            $('#misc-dialog').dialog( "option", {
                title: "Change log for " + distro.name
            });
            $('#misc-dialog').html(
                changes_header(distro) +
                '<div class="changes-body"><p>Loading...</p></div>'
            );
            get_distro_file(distro, 'MANIFEST', function(file_content) {
                var changes_file = guess_changes_file(file_content);
                if(changes_file) {
                    distro.changes_file_name = changes_file;
                    get_distro_file(distro, changes_file, function(file_content) {
                        $('#misc-dialog').html(
                            changes_header(distro) +
                            '<div class="changes-body"><p>Loading...</p></div>'
                        );
                        $('#misc-dialog .changes-body').html(
                            $('<pre class="change-log" />').text(file_content)
                        );
                        log_page_view({'changelog': distro.name});
                    }, function() {
                        $('#misc-dialog .changes-body').html(
                            '<p class="not-found">Unable to retrieve ' + changes_file +
                            ' for this distribution.</p>'
                        );
                    });
                }
                else {
                    $('#misc-dialog .changes-body').html(
                        '<p class="not-found">Unable to find the change-log file in this distribution.</p>'
                    );
                }
            }, function() {
                $('#misc-dialog .changes-body').html(
                    '<p class="not-found">Unable to retrieve the MANIFEST for this distribution.</p>'
                );
            });
            open_misc_dialog();
        }

        function guess_changes_file(manifest) {
            // List every potential candidate file
            var lines = manifest.split('\n');
            var match = {};
            var i, file;
            for(i = 0; i < lines.length; i++) {
                if(lines[i].match(/^chang[^\/]+$/i)) {
                    file = lines[i].replace(/\r/, '').replace(/\s.*$/, '');
                    match[file] = true;
                }
            }

            // Look for the most common filenames in preferred order
            var preferred = [ 'Changes', 'CHANGES', 'ChangeLog', 'CHANGELOG', 'Changelog' ];
            for(i = 0; i < preferred.length; i++) {
                file = preferred[i];
                if(match[file]) {
                    return file;
                }
            }

            // Choose the one with the shortest filename
            var shortest = null;
            for(file in match) {
                if(shortest === null || file.length < shortest.length) {
                    shortest = file;
                }
            }
            return shortest;
        }

        function changes_header(distro) {
            var header_html = '<div class="pod-header">metacpan.org ' +
                '<span class="sep">&#9656;</span> ' +
                '<a href="https://metacpan.org/author/' + distro.maintainer.id +
                '" title="Maintainer">' + distro.maintainer.name + '</a> ' +
                '<span class="sep">&#9656;</span> ' +
                '<a href="https://metacpan.org/release/' + distro.dname +
                '" title="Distribution">' + distro.dname + '</a> ';
            if(distro.changes_file_name) {
                header_html += '<span class="sep">&#9656;</span> ' +
                '<a href="https://metacpan.org/source/' + distro.maintainer.id +
                '/' + distro.meta.name + '/' + distro.changes_file_name +
                '" title="Change log">' + distro.changes_file_name + '</a> ';
            }
            else {
                header_html += '<span class="sep">&#9656;</span> Changes';
            }
            return header_html + '</div>';
        }

        function show_dependency_graph(distro) {
            $('#misc-dialog').dialog( "option", {
                title: "Dependency graph for " + distro.name
            });
            open_misc_dialog(1200);
            $('#misc-dialog').html(
                '<iframe src="//widgets.stratopan.com/wheel?q=' + distro.name +
                '" width="100%" height="100%" frameborder="0">'
            );
            log_page_view({'graph': distro.name});
        }

        function open_misc_dialog(max_width) {
            if(!max_width) {
                max_width = 800;
            }
            var dlg_height = $(window).height() - 100;
            var dlg_width  = $(window).width()  - 100;
            if(dlg_width > max_width) { dlg_width = max_width; }
            $('#misc-dialog').dialog( "option", {
                "height" : dlg_height,
                "width"  : dlg_width
            }).dialog('open');
        }

        function get_distro_file(distro, filename, handler, error_handler) {
            var file_source_url = opt.ajax_source_url_base +
                distro.meta.author + '/' + distro.meta.name + '/' + filename;
            if(distro.file) {
                if(distro.file[filename]) {
                    return handler(distro.file[filename]);
                }
            }
            else {
                distro.file = {};
            }
            if(!error_handler) {
                error_handler = function() { app.trigger('ajax_load_failed: ' + file_source_url); };
            }
            $.ajax({
                url: file_source_url,
                success: function (file_content) {
                    distro.file[filename] = file_content;
                    handler(file_content);
                },
                error: error_handler,
                timeout: 10000
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
            var distro = find_distro_by_name(distro_name);
            if(!distro) {
                app.trigger('not_found', 'a distro called "' + distro_name + '"');
                return;
            }
            var release_name = distro.name.replace(/::/g, '-');
            if(distro.meta) {  //  Data is in cache already
                handler(distro);
                return;
            }
            $.ajax({
                url: opt.ajax_release_url_base + release_name,
                dataType: 'json',
                success: function(data) {
                    if(!data.resources) {
                        data.resources = { };
                    }
                    if(!data.resources.bugtracker) {
                        data.resources.bugtracker = {
                            web : opt.rt_dist_url + data.distribution
                        };
                    }
                    distro.meta = data;
                    set_avatar_url(distro.maintainer);
                    if(!data.abstract) {
                        distro.dist_id = distro.dname.toLowerCase();
                        generate_distro_abstract(distro);
                    }
                    handler(distro);
                },
                error: function() { app.trigger('ajax_load_failed'); },
                timeout: 10000
            });
        }

        function generate_distro_abstract(distro) {
            var main_module = distro.main_module || distro.name;
            $.ajax({
                url: opt.ajax_pod_url_base + main_module,
                data: { 'content-type': 'text/x-pod' },
                dataType: 'text',
                success: function (pod_text) {
                    distro.meta.abstract = extract_abstract_from_pod(pod_text);
                    $('#abstract-' + distro.dist_id).text(distro.meta.abstract);
                },
                error: function() {
                    distro.meta.abstract = 'No abstract';
                    $('#abstract-' + distro.dist_id).text('No abstract');
                },
                timeout: 10000
            });
        }

        function extract_abstract_from_pod(pod_text) {
            var text;
            if(pod_text.match(/(?:^|\n)=head1\s+NAME\s+\S+ +(?:-+ +)?((?:.|\n)*?)\r?\n\r?\n/)) {
                text = RegExp.$1;
                return text.replace(/[LCF]<(.*?)>/g, '$1');
            }
            if(pod_text.match(/(?:^|\n)=head1\s+DESCRIPTION\s+(\S(?:.|\n)*?\r?\n\r?\n)/)) {
                text = RegExp.$1;
                text = text.replace(/[.]\s(?:.|\n)*$/, '.');
                return text.replace(/[LCF]<(.*?)>/g, '$1');
            }
            return 'No abstract';
        }

        function find_distro_by_name(name) {
            var i = cpan.distro_num[ name ];
            if(typeof(i) !== 'undefined') {
                return cpan.distro[i];
            }
            name = name.toLowerCase();
            for(var d = 0; d < cpan.distro.length; d++) {
                if(cpan.distro[d].lname === name) {
                    return cpan.distro[d];
                }
            }
            return null;
        }

        function ajax_load_distro_dependencies(distro_name, handler) {
            ajax_load_distro_detail(distro_name, function(distro) {
                if(!distro.deps) {
                    var fdeps = format_dependencies(distro.meta.dependency);
                    distro.deps = fdeps.phased_deps;
                    distro.dep_highlights = fdeps.highlights;
                }
                handler(distro);
            });
        }

        function format_dependencies(dep_list) {
            var by_phase = {};
            var highlights = [];
            var phase;
            for(var i = 0; i < dep_list.length; i++) {
                var dep = dep_list[i];
                phase = dep.phase || 'runtime';
                if(!by_phase[phase]) {
                    by_phase[phase] = [];
                }
                var fdep = format_dep(dep);
                if(fdep.distro) {
                    highlights.push(fdep.index);
                }
                by_phase[phase].push(fdep);
            }
            var phased_deps = [];
            for(var key in by_phase) {
                if(by_phase.hasOwnProperty(key)) {
                    phased_deps.push({ 'name' : key, 'deps' : by_phase[key] });
                }
            }

            return { 'phased_deps' : phased_deps, 'highlights' : highlights };
        }

        function format_dep(dep) {
            var d = {
                'module'  : dep.module,
                'version' : dep.version || 0
            };
            var distro = distro_for_module( dep.module );
            if(distro) {
                d.index = distro.index;
                d.distro = distro.name;
            }
            return d;
        }

        function distro_for_module(module) {
            var distro_name = cpan.distro_for_module[module];
            if(distro_name) {
                return find_distro_by_name(distro_name);
            }
            var i = cpan.distro_num[ module ];
            if(typeof(i) !== 'undefined') {
                return cpan.distro[i];
            }
            return;
        }

        function ajax_load_distro_reverse_deps(distro_name, handler) {
            var i = cpan.distro_num[ distro_name ];
            if(i === null) { return; }
            var distro = cpan.distro[i];
            if(distro == null) { return; }
            if(distro.rdeps) {  //  Data is in cache already
                handler(distro);
                return;
            }
            // query uses Distro::Name rather than Distro-Name
            var query_url = make_query_url('/release/_search', {
                "query":  { "match_all": {} },
                "filter": {
                    "and": [
                        { "term": { "dependency.module": distro.name } },
                        { "term": { "maturity":          "released"  } },
                        { "term": { "status":            "latest"    } }
                    ]
                },
                "fields": [ "distribution", "author", "date" ],
                "sort":   [ "distribution" ],
                "size":   5000
            });
            $.ajax({
                url: query_url,
                dataType: 'json',
                success: function(data) {
                    format_reverse_dependencies( distro, (data.hits || {}).hits || [] );
                    handler(distro);
                },
                error: function() { app.trigger('ajax_load_failed'); },
                timeout: 10000
            });
        }

        function format_reverse_dependencies(distro, hits) {
            distro.rdeps = [];
            distro.rdep_highlights = [];
            for(var i = 0; i < hits.length; i++) {
                var rec = hits[i].fields || {};
                var name = rec.distribution;
                if(name) {
                    name = name.replace(/-/g, '::');
                    var d = cpan.distro_num[ name ];
                    if(typeof(d) !== 'undefined') {
                        set_distro_date(distro, rec.date);
                        var maint = find_maint_by_id(rec.author) || {};
                        distro.rdeps.push( {
                            'distro': name,
                            'maint_id': rec.author,
                            'maint_name': maint.name || rec.author,
                            'release_date' : distro.release_date,
                            'index': d
                        } );
                        distro.rdep_highlights.push(d);
                    }
                }
            }
        }

        function ajax_load_maint_detail(maint_id, handler) {
            var maint = find_maint_by_id(maint_id);
            if(!maint) {
                app.trigger('not_found', 'a maintainer called "' + maint_id + '"');
                return;
            }
            if(maint.meta) {  //  Data is in cache already
                handler(maint);
                return;
            }
            $.ajax({
                url: opt.ajax_author_url_base + maint_id,
                dataType: 'json',
                success: function(data) {
                    maint.meta = data;
                    maint.name = data.name;
                    if(data.city) {
                        data.location = data.city;
                        if(data.country) {
                            data.location = data.location + ', ' + data.country;
                        }
                    }
                    else {
                        if(data.country) {
                            data.location = data.country;
                        }
                    }
                    delete( maint.avatar_url );
                    set_avatar_url(maint);
                    format_social_links(maint);
                    handler(maint);
                },
                error: function() { app.trigger('ajax_load_failed'); },
                timeout: 10000
            });
        }

        function ajax_load_maintainer_distro_dates(maint, distros) {
            var ajax_distro_list_url = make_query_url('/release/_search', {
                "query" : { "match_all" : {} },
                "filter" : {
                    "and" : [
                        { "term" : { "author" : maint.id } },
                        { "term" : { "status" : "latest" } }
                    ]
                },
                "fields" : [ "distribution", "date" ],
                "size" : 1000
            });
            $.ajax({
                url: ajax_distro_list_url,
                dataType: 'json',
                success: function(data) {
                    var hits = (data.hits || {}).hits || [];
                    for(var i = 0; i < hits.length; i++) {
                        var fields = hits[i].fields || {};
                        set_distro_date(fields.distribution, fields.date);
                    }
                    maint.dates_loaded = true;
                    display_maintainer_distro_list(maint, distros);
                },
                error: function() { app.trigger('ajax_load_failed'); },
                timeout: 10000
            });
        }

        function set_distro_date(distro, release_date) {
            if(typeof(distro) === "string") {
                distro = find_distro_by_name(distro.replace(/-/g, '::'));
            }
            if(distro && release_date && release_date.length >= 10) {
                distro.release_date = release_date.substring(0, 10);
            }
        }

        function display_maintainer_distro_list(maint, distros) {
            var table = $('<table class="maint-distro-list tablesorter" />').append(
                $('<thead />').append(
                    $('<tr />').append(
                        $('<th />').text('Distribution'),
                        $('<th />').text('Released')
                    )
                )
            );
            var tbody = $('<tbody />');
            for(var i = 0; i < distros.length; i++) {
                tbody.append(
                    $('<tr />').append(
                        $('<td />').append(
                            $('<a />').attr({
                                title: distros[i].name + ' released ' + distros[i].release_date,
                                href: '#/distro/' + distros[i].name
                            }).text(distros[i].name)
                        ),
                        $('<td class="date"/>').text(distros[i].release_date)
                    )
                );
            }
            $('#' + maint.distro_list_id).removeClass('loading').html(table.append(tbody));
            $('#' + maint.distro_list_id + ' table').tablesorter({
                sortList: [[0,0]]
            });
        }

        function find_maint_by_id(cpanid) {
            var i = cpan.maint_num[ cpanid ];
            if(typeof(i) !== 'undefined') {
                return cpan.maint[i];
            }
            return null;
        }

        function highlight_distros_for_maint(context, cpanid) {
            var highlights = [];
            var distros = [];
            for(var i = 0; i < cpan.distro.length; i++) {
                if(cpan.distro[i].maintainer.id === cpanid) {
                    highlights.push(i);
                    distros.push(cpan.distro[i]);
                }
            }
            context.set_highlights(highlights);
            return distros;
        }

        function set_avatar_url(maintainer) {
            if(maintainer.avatar_url) { return; }
            var meta_gravatar_url = (maintainer.meta || {}).gravatar_url || '';
            if(meta_gravatar_url.match(/\/avatar\/([0-9a-f]+)/)) {
                maintainer.gravatar_id = RegExp.$1;
            }
            if(maintainer.gravatar_id) {
                maintainer.avatar_url = opt.avatar_url_template.replace(/%ID%/, maintainer.gravatar_id);
            }
            else {
                maintainer.avatar_url = opt.default_avatar;
            }
        }

        function format_social_links(maintainer) {
            var sites = maintainer.meta.profile || [];
            var links = [];
            for(var i = 0; i < sites.length; i++) {
                var site = sites[i];
                var url = social_links[ site.name ];
                if(url && site.id) {
                    if(site.id.match(/^https?:/)) {
                        links.push({
                            'name'  : site.name,
                            'url'   : site.id,
                            'id'    : site.id.replace(/^.*\/([^\/]+)\/?/, '$1')
                        });
                    }
                    else {
                        links.push({
                            'name'  : site.name,
                            'url'   : url.replace(/%ID%/, site.id),
                            'id'    : site.id
                        });
                    }
                }
            }
            if(links.length > 0) {
                maintainer.social_links = links;
            }
        }

        function ajax_map_module_to_distro(mod_name, handler) {
            var distro = distro_for_module(mod_name) || find_distro_by_name(mod_name);
            if(distro) {
                return handler(distro.name);
            }
            var search_url = opt.ajax_module_url_base + mod_name;
            $.ajax({
                url: search_url,
                dataType: 'json',
                success: function(data) {
                    var distro_name = (data || {}).distribution;
                    distro_name = distro_name.replace(/-/g, '::');
                    cpan.distro_for_module[mod_name] = distro_name;
                    handler(distro_name);
                },
                error: function() { app.trigger('ajax_load_failed'); },
                timeout: 10000
            });
        }

        function top_maintainters_by_distro() {
            if(cpan.top_maintainters_by_distro) {
                return cpan.top_maintainters_by_distro;
            }
            var maints = [];
            for(var i = 0; i < cpan.maint.length; i++) {
                var maint = cpan.maint[i];
                if(maint.distro_count >= 50) {
                    maints.push(maint);
                }
            }
            maints.sort(function(a, b) { return b.distro_count - a.distro_count; } );
            add_rankings(maints, 'distro_count');
            cpan.top_maintainters_by_distro = maints;
            return maints;
        }

        function load_from_cache(cache_key, handler) {
            if(query_cache[cache_key]) {
                handler( query_cache[cache_key] );
                return true;
            }
            return false;
        }

        function cache_store(cache_key, data) {
            query_cache[cache_key] = data;
            return data;
        }

        function ajax_load_favorites_leaderboard(handler) {
            var cache_key = 'favorites_leaderboard';
            if(load_from_cache(cache_key, handler)) {
                return;
            }
            var ajax_leaderboard_url = make_query_url('/favorite/_search', {
                "size": 0,
                "query": { "match_all": {} },
                "facets": {
                    "leaderboard": {
                        "terms": {
                            "field": "distribution",
                            "size": 100
                        }
                    }
                }
            });
            $.ajax({
                url: ajax_leaderboard_url,
                dataType: 'json',
                success: function(data) {
                    var highlights  = [];
                    var distro_list = [];
                    var hits = ((data.facets || {}).leaderboard || {}).terms || [];
                    for(var i = 0; i < hits.length; i++) {
                        var name = hits[i].term.replace(/-/g, '::');
                        distro_list.push({
                            "score": hits[i].count,
                            "name":  name
                        });
                        var distro = find_distro_by_name(name);
                        if(distro) {
                            highlights.push(distro.index);
                        }
                    }
                    add_rankings(distro_list, 'score');
                    handler(
                        cache_store(cache_key, {
                            "highlights": highlights,
                            "distro_list": distro_list
                        })
                    );
                },
                error: function() { app.trigger('ajax_load_failed'); },
                timeout: 10000
            });
        }

        function ajax_load_recent_favorites(handler) {
            var cache_key = 'recent_favorites';
            if(load_from_cache(cache_key, handler)) {
                return;
            }
            var query_url = make_query_url('/favorite/_search', {
                "query": { "match_all": {} },
                "size": 100,
                "fields": [ "distribution", "author", "date" ],
                "sort": [ { "date": "desc" } ]
            });
            $.ajax({
                url: query_url,
                dataType: 'json',
                success: function(data) {
                    var highlights  = [];
                    var distro_list = [];
                    var now = new Date().getTime();
                    var hits = (data.hits || {}).hits || [];
                    for(var i = 0; i < hits.length; i++) {
                        var row = hits[i].fields;
                        var name = row.distribution.replace(/-/g, '::');
                        var distro = find_distro_by_name(name);
                        if(!distro) {
                            continue;
                        }
                        var uploader = row.author || '';
                        var maint = find_maint_by_id(row.author);
                        if(maint) {
                            uploader = maint.name + " (" + maint.id + ")";
                        }
                        distro_list.push({
                            "name": name,
                            "maint": uploader,
                            "maint_id": row.author,
                            "age": relative_time(row.date, now)
                        });
                        highlights.push(distro.index);
                        if(distro_list.length >= 60) {
                            break;
                        }
                    }
                    handler(
                        cache_store(cache_key, {
                            "highlights": highlights,
                            "distro_list": distro_list
                        })
                    );
                },
                error: function() { app.trigger('ajax_load_failed'); },
                timeout: 10000
            });
        }

        function relative_time(date_string, cached_now) {
            var now = cached_now || new Date().getTime();
            var age = Math.floor((now - Date.parse(date_string)) / 60000);
            if(age < 2) {
                return '1 minute';
            }
            if(age < 60) {
                return age + ' minutes';
            }
            age = Math.floor(age / 60);
            if(age < 2) {
                return '1 hour';
            }
            if(age < 48) {
                return age + ' hours';
            }
            age = Math.floor(age / 24);
            return age + ' days';
        }

        function ajax_load_recent_uploads(handler) {
            var cache_key = 'recent_uploads';
            if(load_from_cache(cache_key, handler)) {
                return;
            }
            $.ajax({
                url: opt.ajax_release_url_base + '_search',
                data: {
                    "q"      : "status:latest",
                    "fields" : "name,distribution,version,author,date",
                    "sort"   : "date:desc",
                    "size"   : "100"
                },
                dataType: 'json',
                success: function(data) {
                    var highlights  = [];
                    var distro_list = [];
                    var now = new Date().getTime();
                    var hits = (data.hits || {}).hits || [];
                    for(var i = 0; i < hits.length; i++) {
                        var row = hits[i].fields;
                        var name = row.distribution.replace(/-/g, '::');
                        var distro = find_distro_by_name(name);
                        if(!distro) {
                            continue;
                        }
                        var uploader = row.author || '';
                        var maint = find_maint_by_id(row.author);
                        if(maint) {
                            uploader = maint.name + " (" + maint.id + ")";
                        }
                        distro_list.push({
                            "name":  name,
                            "maint": uploader,
                            "maint_id": row.author,
                            "version": row.version,
                            "age": relative_time(row.date, now)
                        });
                        highlights.push(distro.index);
                        if(distro_list.length >= 60) {
                            break;
                        }
                    }
                    handler(
                        cache_store(cache_key, {
                            "highlights": highlights,
                            "distro_list": distro_list
                        })
                    );
                },
                error: function() { app.trigger('ajax_load_failed'); },
                timeout: 10000
            });
        }

        function ajax_load_profile_updates(handler) {
            var cache_key = 'profile_updates';
            if(load_from_cache(cache_key, handler)) {
                return;
            }
            $.ajax({
                url: opt.ajax_recent_updates,
                dataType: 'json',
                success: function(data) {
                    var maint_list = [];
                    var hits = (data.hits || {}).hits || [];
                    for(var i = 0; i < hits.length; i++) {
                        var row = hits[i].fields;
                        if(find_maint_by_id(row.pauseid)) {
                            maint_list.push(row);
                        }
                    }
                    handler(
                        cache_store(cache_key, {
                            "maint_list": maint_list
                        })
                    );
                },
                error: function() { app.trigger('ajax_load_failed'); },
                timeout: 10000
            });
        }

        function make_query_url(path, query) {
            return opt.ajax_query_url_base + path +
                '?source=' + encodeURI( JSON.stringify(query) );
        }

        function add_rankings(list, field) {
            var last = null;
            var rank;
            for(var i = 0; i < list.length; i++) {
                if(i > 0  &&  list[i-1][field] === list[i][field]) {
                    list[i-1].rank = rank + '=';
                    list[i].rank   = rank + '=';
                }
                else {
                    rank = i + 1;
                    list[i].rank = rank;
                }
            }
        }

        function highlight_distros($layer) {
            var scale = opt.scale;
            $layer.html('');
            for(var i = 0; i < cpan.highlights.length; i++) {
                var d = cpan.highlights[i];
                var distro = cpan.distro[d];
                $layer.append(
                    $(
                        '<div class="marker" style="top: ' +
                        (distro.row * scale) + 'px; left: ' +
                        (distro.col * scale) + 'px;" />'
                    )
                );
            }
        }

        function autocomplete_maint_name(req, resp) {
            var results = [];
            var extra = [];
            var name = (req.term || '').toUpperCase();
            var len = name.length;
            if(len) {
                for(var i = 0; i < cpan.maint.length; i++) {
                    var j = cpan.maint[i].id.indexOf(name);
                    if(j === 0) {
                        results.push(cpan.maint[i].id + ' - ' + (cpan.maint[i].name || ''));
                        if(results.length > 100) {
                            return resp( results );
                        }
                    }
                    else if(extra.length < 100 && j > 0) {
                        extra.push(cpan.maint[i].id + ' - ' + (cpan.maint[i].name || ''));
                    }
                    else if(extra.length < 100 && cpan.maint[i].name && cpan.maint[i].name.toUpperCase().indexOf(name) >= 0) {
                        extra.push(cpan.maint[i].id + ' - ' + cpan.maint[i].name);
                    }
                }
            }
            resp( results.concat(extra) );
        }

        function autocomplete_distro_name(req, resp) {
            var results = [];
            var extra = [];
            var name = (req.term || '').toLowerCase();
            var len = name.length;
            if(len) {
                for(var i = 0; i < cpan.distro.length; i++) {
                    if(cpan.distro[i].lname.substr(0, len) === name) {
                        results.push(cpan.distro[i].name);
                        if(results.length > 100) {
                            return resp( results );
                        }
                    }
                    else if(extra.length < 100 && cpan.distro[i].lname.indexOf(name) >= 0) {
                        extra.push(cpan.distro[i].name);
                    }
                }
            }
            resp( results.concat(extra) );
        }

    });

    function build_ticker($el, items) {
        var $viewport = $el.find('.map-viewport');
        var $ul = $('<ul />').css({
            'left': parseInt($viewport.width(), 10) - 150
        });
        var hovering = false;
        var paused   = false;
        for(var i = 0; i < items.length; i++) {
            if(i > 30) { continue; }
            var distro = items[i];
            $ul.append(
                $('<li />').append (
                    $('<a />').text(items[i].name).attr({
                        href: '#/distro/' + distro.name,
                        title: 'Version ' + distro.version + ' uploaded by ' + distro.maint
                    }),
                    items[i].age.replace(/ hour/, 'hr')
                )
            );
        }
        $ul.append( $('<li>. . . . . . . . .</li>') );
        var $ticker = $('<div class="uploads-ticker" />').append(
            $('<div class="mask" />'),
            $ul,
            $('<label><a href="#/sights/recent-uploads">Recent Uploads:</a></label>'),
            $('<div class="x">X</div>').click(function() {
                $(this).parent().remove();
            })
        );
        $viewport.append( $ticker );

        function start_ticker () {
            if(hovering || paused) { return; }
            var w = parseInt($ul.find('li').outerWidth(), 10);
            var x = parseInt($ul.css('left'), 10);
            var target = x > 0 ? 0 : (0 - w);
            var delta  = x - target;
            $ul.animate({ left: target }, delta * 20, 'linear', function() {
                if(target < 0) {
                    $ul.append( $ul.find('li:first').detach() );
                    $ul.css({'left': 0});
                }
                paused = true;
                setTimeout(function() { paused = false; start_ticker(); }, 2000);
            });
        }

        $ul.hover(
            function() { hovering = true;  $(this).stop(true); },
            function() { hovering = false; start_ticker(); }
        );

        $ticker.animate({ bottom: 0 }, 700, start_ticker);
    }


    function log_page_view(params) {
        if(!opt.stats_domain || (opt.stats_domain === document.location.host)) {
            params.time = $.now();
            $.get('ping.txt', params);
        }
    }


    app.error = function(message, exception) {
        var html = $('<div class="info" />').append(
            $('<p />').text(message)
        );
        if(exception) {
            html.append( $('<p />').text( exception.toString() ) );
        }
        this.$element().find('.map-info-panel').html(html).removeClass('loading');
    };

    // Called from the main CpanMap() function (typically on document ready):
    // Add the required UI elements, download the CPAN metadata and then launch
    // the Sammy application.

    function build_app($el, run_app) {
        var loc = window.location;
        opt.app_base_url = loc.protocol + '//' + loc.host +
                           loc.pathname.replace(/index[.]html$/, '');
        var default_avatar = opt.default_avatar;
        if(!window.location.hostname.match(/[.]/)) {
            default_avatar = 'mm';
        }
        else if(!default_avatar.match(/^\w+:/)) {
            default_avatar = opt.app_base_url + default_avatar;
        }
        opt.avatar_url_template = opt.avatar_url_template.replace(/%DEFAULT_URL%/, encodeURI(default_avatar));

        var $viewport = $('<div class="map-viewport" />');
        $el.addClass('cpan-map');
        $el.append(
            $('<div class="map-controls-wrapper" />').append(
                $('<h1 class="app-title" />').append(
                    $('<a href="#/" / title="Home">').text( opt.app_title )
                ),
                $('<div class="map-controls" />')
            ),
            $('<div class="map-panel loading" />').append(
                $('<div class="map-info-panel" />'),
                $viewport.html('<div class="init">Loading map data</div>'),
                $('<div class="map-separator" />')
            ),
            $('<p class="copyright">Copyright &copy; 2011-2014 <a href="#/maint/GRANTM">Grant McLean</a></p>')
        );
        if(opt.sponsor_text) {
            $el.append(
                $('<p class="sponsor" />').append(
                    $('<a />').attr('href',opt.sponsor_link).text(opt.sponsor_text)
                )
            );
        }
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
        };
    }

    function parse_data(next_record) {
        var rec, handler;

        var add_meta = function(rec) {
            if(rec.length === 2) {
                cpan.meta[ rec[0] ] = rec[1];
            }
            else {
                var name = rec.shift();
                cpan.meta[ name ] = rec;
            }
        };

        var add_maint = function(rec) {
            var m = { id: rec[0], distro_count: 0 };
            if(rec.length > 1) { m.name        = rec[1]; }
            if(rec.length > 2) { m.gravatar_id = rec[2]; }
            m.distro_list_id = 'dist-list-' + m.id.toLowerCase();
            cpan.maint_num[m.id] = cpan.maint.length;
            cpan.maint.push(m);
        };

        var add_ns = function(rec) {
            cpan.namespace.push({
                name: rec[0],
                colour: rec[1],
                mass: parseInt(rec[2], 16)
            });
        };

        var add_distro = function(rec) {
            var names = rec[0].split('/');
            var row = parseInt(rec[3], 16);
            var col = parseInt(rec[4], 16);
            var ns;
            var distro = {
                name: names[0],
                lname: names[0].toLowerCase(),
                dname: names[0].replace(/::/g, '-'),
                maintainer: cpan.maint[ parseInt(rec[2], 16) ],
                row: row,
                col: col,
                index: cpan.distro.length
            };
            if(names.length > 1) {
                distro.main_module = names[1];
            }
            distro.maintainer.distro_count++;
            if(rec[1] !== '') {
                ns = cpan.namespace[ parseInt(rec[1], 16) ];
                if(ns) {
                    distro.ns = ns.name;
                }
            }
            if(rec.length > 5) {
                distro.rating_score = rec[5];
                distro.rating_count = rec[6];
                distro.rating_stars = Math.floor(parseFloat(rec[5]) * 2 + 0.5) * 5;
            }
            else {
                distro.rating_stars = null;
            }
            if(!cpan.distro_at[row]) {
                cpan.distro_at[row] = [];
            }
            cpan.distro_at[row][col] = distro.index;
            cpan.distro_num[distro.name] = distro.index;
            cpan.distro.push( distro );
        };

        while((rec = next_record())) {
            if(rec[0] === '[META]')          { handler = add_meta;   continue; }
            if(rec[0] === '[MAINTAINERS]')   { handler = add_maint;  continue; }
            if(rec[0] === '[NAMESPACES]')    { handler = add_ns;     continue; }
            if(rec[0] === '[DISTRIBUTIONS]') { handler = add_distro; continue; }
            if(handler) {
                handler(rec);
            }
        }

    }

    window.CpanMap = function(options) {
        $.extend(opt, options);
        build_app(
            $(opt.app_selector),
            function() { app.run('#/'); }
        );
    };

})(jQuery);

