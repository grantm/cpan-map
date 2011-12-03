/*
 * Map of CPAN
 * Copyright (c) 2011 Grant McLean <grantm@cpan.org>
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
        intro_title           : 'Welcome to the Map of CPAN',
        zoom_minus_label      : 'Zoom map out',
        zoom_plus_label       : 'Zoom map in',
        map_data_url          : 'cpan-map-data.txt',
        ajax_release_url_base : 'http://api.metacpan.org/release/',
        ajax_author_url_base  : 'http://api.metacpan.org/author/',
        ajax_module_url_base  : 'http://api.metacpan.org/module/',
        ajax_rdeps_search_url : 'http://api.metacpan.org/v0/release/_search?source='
                                + '%7B%22fields%22%3A%5B%22distribution%22%5D%2C%22'
                                + 'filter%22%3A%7B%22and%22%3A%5B%7B%22term%22%3A'
                                + '%7B%22release.dependency.module%22%3A%22DISTRO-NAME%22'
                                + '%7D%7D%2C%7B%22term%22%3A%7B%22release.maturity%22%3A'
                                + '%22released%22%7D%7D%2C%7B%22term%22%3A%7B%'
                                + '22release.status%22%3A%22latest%22%7D%7D%5D%7D%2C'
                                + '%22query%22%3A%7B%22match_all%22%3A%7B%7D%7D%2C'
                                + '%22size%22%3A5000%7D',
        rt_dist_url           : 'https://rt.cpan.org/Public/Dist/Display.html?Name=',
        avatar_url_template   : 'http://www.gravatar.com/avatar/%ID%?s=80&d=%DEFAULT_URL%',
        default_avatar        : 'static/images/no-photo.png',
        zoom_scales           : [ 3, 4, 5, 6, 8, 10, 20 ] // must match CSS
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
        'pinboard'           : 'http://pinboard.in/u:%ID%'
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

        this.helper('update_info', function(selector, data) {
            var context = this;
            var html = context.tmpl(template_cache[selector], data);
            $('.map-info-panel').html(html).removeClass('loading').addClass('loaded');
            return context;
        });

        this.helper('not_implemented', function() {   // TODO: unimplement
            var context = this;
            var html = '<div class="not-impl"><h2>Sorry &#9785;</h2>'
                     + '<p>This feature is not yet implemented.</p></div>';
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
            $el.find('.map-plane-sight').mousewheel( function(e, delta) {
                app.trigger(delta < 0 ? 'decrease_zoom' : 'increase_zoom');
            });
            $el.find('label.ctrl-maint').click(function() {
                $el.find('.map-hover-maint').val('').focus();
            });
            $el.find('.map-hover-maint').autocomplete({
                source: autocomplete_maint_name,
                select: function(event, ui) {
                    $(this).val(ui.item.value);
                    $el.find('.form-maint').submit();
                }
            });
            $el.find('label.ctrl-distro').click(function() {
                $el.find('.map-hover-distro').val('').focus();
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
        });

        this.bind('ajax_load_failed', function(e) {
            this.$element().find('.map-info-panel')
                .html('Ajax load failed')
                .removeClass('loading');
            return this;
        });

        this.bind('not_found', function(e, what) {
            var html = this.tmpl(template_cache['#tmpl-not-found'], { 'what' : what });
            this.$element().find('.map-info-panel')
                .html(html)
                .removeClass('loading');
            this.title('Not Found | ' + opt.app_title);
            return this;
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

        this.bind('separator_moved', function(e) {
            var pos = opt.sep_pos
            var $el = this.$element();
            $el.find('.map-info-panel').width(pos);
            $el.find('.map-panel').css({'padding-left': (pos + 10) + 'px'});
            dim.info_width = pos;
            this.trigger('resize');
        });

        this.bind('distro_hover', function(e, distro) {
            var $el = this.$element();
            $el.find('input.map-hover-distro').val(distro.name);
            var maint = distro.maintainer.id;
            if(distro.maintainer.name) {
                maint = maint + ' - ' + distro.maintainer.name
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
            this.update_info('#tmpl-home', cpan.meta)
                .set_highlights([])
                .title(opt.app_title);
            $el.find('.map-info-panel').removeClass('loaded');
            $el.find('a.show-intro').click( show_intro_dialog );
        });

        this.get('#/distro/:name', function(context) {
            this.loading();
            ajax_load_distro_detail( this.params.name, function(distro) {
                context.set_highlights([ distro.index ])
                       .update_info('#tmpl-distro', distro)
                       .title(distro.name + ' | ' + opt.app_title);
            });
        });

        this.get('#/distro/:name/deps', function(context) {
            this.loading();
            ajax_load_distro_dependencies( this.params.name, function(distro) {
                context.set_highlights(distro.dep_highlights)
                       .update_info('#tmpl-deps', distro)
                       .title('Dependencies | ' + distro.name + ' | ' + opt.app_title);
            });
        });

        this.get('#/distro/:name/rdeps', function(context) {
            var context = this.loading();
            ajax_load_distro_reverse_deps( this.params.name, function(distro) {
                context.set_highlights(distro.rdep_highlights)
                       .update_info('#tmpl-rdeps', distro)
                       .title('Reverse Dependencies | ' + distro.name + ' | ' + opt.app_title);
            });
        });

        this.get('#/module/:name', function(context) {
            this.loading();
            var mod_name = this.params.name;
            context.title('Distribution lookup for ' + mod_name + ' | ' + opt.app_title);
            ajax_map_module_to_distro(mod_name, function(distro_name) {
                if(distro_name) {
                    context.redirect('#/distro/' + distro_name);
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
                context.update_info('#tmpl-maint', data)
                       .title(maint.name + ' | ' + opt.app_title);
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
                this.update_info('#tmpl-404', { 'hash_path' : window.location.hash})
                    .$element().find('.map-info-panel').removeClass('loading');
            }
            else {
                this.redirect('#/');
            }
        });


        // Utility functions used by the app

        function initialise_ui_elements($el) {

            $el.find('.map-panel').removeClass('loading');
            $el.find('.map-viewport').html('').append(
                $('<div class="map-plane" />').append(
                    $('<img class="map" src="' + cpan.meta.map_image + '" />'),
                    $('<div class="map-highlights" />'),
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
                $('<form class="form-distro" action="#/search/distro" method="POST" />').append(
                    $('<label class="ctrl-distro" title="Click to clear">Distro</label>'),
                    $('<input class="map-hover-distro" name="distro" value="" />').width(0)
                ),
                $('<form class="form-maint" action="#/search/maint" method="POST" />').append(
                    $('<label class="ctrl-maint" title="Click to clear">Maintainer</label>'),
                    $('<input class="map-hover-maint" name="maint" value="" />').width(0)
                )
            );

            size_controls($el);
            set_initial_zoom($el);
            center_map($el);
            enable_plane_drag($el);
            enable_separator_drag($el);
            attach_hover_handler($el);
            initialise_intro_dialog();
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
            if(pheight < (height - 40)) {
                var yoffset = (height - pheight - 40) / 2;
                $el.find('.map-plane').css({top: yoffset + 'px'});
            }
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

            for(var z = 1; z < zoom_scales.length; z++) {
                $plane.removeClass('zoom' + z);
            }
            $plane.addClass('zoom' + new_zoom);

            var i = parseInt(new_zoom);
            var width  = opt.scale * cpan.meta.plane_cols;
            var height = opt.scale * cpan.meta.plane_rows;
            $plane.width(width).height(height);
            $plane.find('img.map').width(width).height(height);
            $el.find('.map-plane-sight').css({
                width:  (opt.scale - 2) + 'px',
                height: (opt.scale - 2) + 'px'
            });
            app.trigger('show_highlights');
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
                    if(opt.sep_pos != new_pos) {
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
                col = Math.floor((e.pageX - offset.left) / opt.scale);
                row = Math.floor((e.pageY - offset.top) / opt.scale);
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
                data: { application: 'cpan-map' },
                dataType: 'jsonp',
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
                    handler(distro);
                },
                error: function() { app.trigger('ajax_load_failed') },
                timeout: 10000
            });
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
            var search_url = opt.ajax_rdeps_search_url.replace(/DISTRO-NAME/, distro.name);
            $.ajax({
                url: search_url,
                data: { application: 'cpan-map' },
                dataType: 'jsonp',
                success: function(data) {
                    format_reverse_dependencies( distro, (data.hits || {}).hits || [] )
                    handler(distro);
                },
                error: function() { app.trigger('ajax_load_failed') },
                timeout: 10000
            });
        }

        function format_reverse_dependencies(distro, hits) {
            distro.rdeps = [];
            distro.rdep_highlights = [];
            var seen = {}
            for(var i = 0; i < hits.length; i++) {
                var name = (hits[i].fields || {}).distribution;
                if(name) {
                    name = name.replace(/-/g, '::');
                    var d = cpan.distro_num[ name ];
                    if(typeof(d) !== 'undefined') {
                        distro.rdeps.push( { 'distro' : name, 'index' : d } );
                        distro.rdep_highlights.push(d);
                    }
                    else {
                        distro.rdeps.push( { 'module' : name } );
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
                data: { application: 'cpan-map' },
                dataType: 'jsonp',
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
                error: function() { app.trigger('ajax_load_failed') },
                timeout: 10000
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
                if(cpan.distro[i].maintainer.id == cpanid) {
                    highlights.push(i);
                    distros.push(cpan.distro[i]);
                }
            }
            context.set_highlights(highlights);
            return distros;
        }

        function set_avatar_url(maintainer) {
            if(maintainer.avatar_url) { return; }
            if(maintainer.meta && maintainer.meta.gravatar_url.match(/\/avatar\/([0-9a-f]+)/)) {
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
                    links.push({
                        'name'  : site.name,
                        'url'   : url.replace(/%ID%/, site.id),
                        'id'    : site.id
                    })
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
                data: { application: 'cpan-map' },
                dataType: 'jsonp',
                success: function(data) {
                    var distro_name = (data || {}).distribution;
                    distro_name = distro_name.replace(/-/g, '::');
                    cpan.distro_for_module[mod_name] = distro_name;
                    handler(distro_name);
                },
                error: function() { app.trigger('ajax_load_failed') },
                timeout: 10000
            });
        }

        function highlight_distros($layer) {
            var scale = opt.scale;
            $layer.html('');
            for(var i = 0; i < cpan.highlights.length; i++) {
                var d = cpan.highlights[i];
                var distro = cpan.distro[d];
                $layer.append(
                    $(
                        '<div class="marker" style="top: '
                        + (distro.row * scale) + 'px; left: '
                        + (distro.col * scale) + 'px;" />'
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


    app.error = function(message, exception) {
        var html = $('<div class="info" />').append(
            $('<p />').text(message)
        );
        if(exception) {
            html.append( $('<p />').text( exception.toString() ) );
        }
        this.$element().find('.map-info-panel').html(html).removeClass('loading');
    };

    // On document ready, Add the required UI elements, download the CPAN
    // metadata and then launch the Sammy application.

    $(function() {

        function build_app($el, run_app) {
            var loc = window.location;
            opt.app_base_url = loc.protocol + '//' + loc.host
                             + loc.pathname.replace(/index[.]html$/, '');
            if(!opt.default_avatar.match(/^\w+:/)) {
                opt.default_avatar = opt.app_base_url + opt.default_avatar;
            }
            opt.avatar_url_template = opt.avatar_url_template.replace(/%DEFAULT_URL%/, escape(opt.default_avatar));

            var $controls = $('<div class="map-controls" />');
            var $viewport = $('<div class="map-viewport" />');
            $el.addClass('cpan-map');
            $el.append(
                $('<h1 />').text( opt.app_title ),
                $('<div class="map-panel loading" />').append(
                    $controls,
                    $('<div class="map-info-panel" />'),
                    $viewport.html('<div class="init">Loading map data</div>'),
                    $('<div class="map-separator" />')
                ),
                $('<p class="copyright">Copyright &copy; 2011 <a href="#/maint/GRANTM">Grant McLean</a></p>')
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
            };

            var add_maint = function(rec) {
                var m = { id: rec[0] };
                if(rec.length > 1) { m.name        = rec[1]; }
                if(rec.length > 2) { m.gravatar_id = rec[2]; }
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
                var row = parseInt(rec[3], 16);
                var col = parseInt(rec[4], 16);
                var distro = {
                    name: rec[0],
                    lname: rec[0].toLowerCase(),
                    maintainer: cpan.maint[ parseInt(rec[2], 16) ],
                    row: row,
                    col: col,
                    index: cpan.distro.length
                }
                if(rec[1] != '') {
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
                cpan.distro_at[row][col] = distro.index
                cpan.distro_num[distro.name] = distro.index
                cpan.distro.push( distro );
            };

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
