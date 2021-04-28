/////////////////////////////////////////////////////////////
//
// pgAdmin 4 - PostgreSQL Tools
//
// Copyright (C) 2013 - 2021, The pgAdmin Development Team
// This software is released under the PostgreSQL Licence
//
//////////////////////////////////////////////////////////////

define(
  ['underscore', 'sources/pgadmin', 'jquery', 'wcdocker'],
  function(_, pgAdmin, $) {

    var pgBrowser = pgAdmin.Browser = pgAdmin.Browser || {},
      wcDocker = window.wcDocker;

    pgAdmin.Browser.Panel = function(options) {
      var defaults = [
        'name', 'title', 'width', 'height', 'showTitle', 'isCloseable',
        'isPrivate', 'isLayoutMember', 'content', 'icon', 'events', 'onCreate', 'elContainer',
        'canHide', 'limit', 'extraClasses',
      ];
      _.extend(this, _.pick(options, defaults));
    };

    _.extend(pgAdmin.Browser.Panel.prototype, {
      name: '',
      title: '',
      width: 300,
      height: 600,
      showTitle: true,
      isCloseable: true,
      isPrivate: false,
      isLayoutMember: true,
      content: '',
      icon: '',
      panel: null,
      onCreate: null,
      elContainer: false,
      limit: null,
      extraClasses: null,
      load: function(docker, title) {
        var that = this;
        if (!that.panel) {
          docker.registerPanelType(that.name, {
            title: that.title,
            isPrivate: that.isPrivate,
            limit: that.limit,
            isLayoutMember: that.isLayoutMember,
            onCreate: function(myPanel) {
              $(myPanel).data('pgAdminName', that.name);
              myPanel.initSize(that.width, that.height);

              if (!that.showTitle)
                myPanel.title(false);
              else {
                var title_elem = '<a href="#" tabindex="-1" class="panel-link-heading">' + (title || that.title) + '</a>';
                myPanel.title(title_elem);
                if (that.icon != '')
                  myPanel.icon(that.icon);
              }

              var $container = $('<div>', {
                'class': 'pg-panel-content',
              }).append($(that.content));

              // Add extra classes
              if (!_.isNull('extraClasses')) {
                $container.addClass(that.extraClasses);
              }

              myPanel.closeable(!!that.isCloseable);
              myPanel.layout().addItem($container);
              that.panel = myPanel;
              if (that.events && _.isObject(that.events)) {
                _.each(that.events, function(v, k) {
                  if (v && _.isFunction(v)) {
                    myPanel.on(k, v);
                  }
                });
              }
              _.each([
                wcDocker.EVENT.UPDATED, wcDocker.EVENT.VISIBILITY_CHANGED,
                wcDocker.EVENT.BEGIN_DOCK, wcDocker.EVENT.END_DOCK,
                wcDocker.EVENT.GAIN_FOCUS, wcDocker.EVENT.LOST_FOCUS,
                wcDocker.EVENT.CLOSED, wcDocker.EVENT.BUTTON,
                wcDocker.EVENT.ATTACHED, wcDocker.EVENT.DETACHED,
                wcDocker.EVENT.MOVE_STARTED, wcDocker.EVENT.MOVE_ENDED,
                wcDocker.EVENT.MOVED, wcDocker.EVENT.RESIZE_STARTED,
                wcDocker.EVENT.RESIZE_ENDED, wcDocker.EVENT.RESIZED,
                wcDocker.EVENT.SCROLLED,
              ], function(ev) {
                myPanel.on(ev, that.eventFunc.bind(myPanel, ev));
              });

              if (that.onCreate && _.isFunction(that.onCreate)) {
                that.onCreate.apply(that, [myPanel, $container]);
              }

              // Prevent browser from opening the drag file.
              $('.pg-panel-content').bind('dragover', function (event) {
                event.stopPropagation();
                event.preventDefault();
              });
              $('.pg-panel-content').bind('drop', function (event) {
                event.stopPropagation();
                event.preventDefault();
              });

              if (that.elContainer) {
                myPanel.pgElContainer = $container;
                $container.addClass('pg-el-container');
                _.each([
                  wcDocker.EVENT.RESIZED, wcDocker.EVENT.ATTACHED,
                  wcDocker.EVENT.DETACHED, wcDocker.EVENT.VISIBILITY_CHANGED,
                ], function(ev) {
                  myPanel.on(ev, that.resizedContainer.bind(myPanel));
                });
                that.resizedContainer.apply(myPanel);
              }

              // Bind events only if they are configurable
              if (that.canHide) {
                _.each([wcDocker.EVENT.CLOSED, wcDocker.EVENT.VISIBILITY_CHANGED],
                  function(ev) {
                    myPanel.on(ev, that.handleVisibility.bind(myPanel, ev));
                  });
              }
            },
          });
        }
      },
      eventFunc: function(eventName) {
        var name = $(this).data('pgAdminName');

        try {
          pgBrowser.Events.trigger(
            'pgadmin-browser:panel', eventName, this, arguments
          );
          pgBrowser.Events.trigger(
            'pgadmin-browser:panel:' + eventName, this, arguments
          );

          if (name) {
            pgBrowser.Events.trigger(
              'pgadmin-browser:panel-' + name, eventName, this, arguments
            );
            pgBrowser.Events.trigger(
              'pgadmin-browser:panel-' + name + ':' + eventName, this, arguments
            );
          }
        } catch (e) {
          console.warn(e.stack || e);
        }
      },
      resizedContainer: function() {
        var p = this;

        if (p.pgElContainer && !p.pgResizeTimeout) {
          if (!p.isVisible()) {
            clearTimeout(p.pgResizeTimeout);
            p.pgResizeTimeout = null;

            return;
          }
          p.pgResizeTimeout = setTimeout(
            function() {
              var w = p.width(),
                elAttr = 'xs';
              p.pgResizeTimeout = null;

              /** Calculations based on https://getbootstrap.com/docs/4.1/layout/grid/#grid-options **/
              if (w < 480) {
                elAttr = 'xs';
              }
              if (w >= 480) {
                elAttr = 'sm';
              }
              if (w >= 768) {
                elAttr = 'md';
              }
              if (w >= 992) {
                elAttr = 'lg';
              }
              if (w >=1200) {
                elAttr = 'xl';
              }

              p.pgElContainer.attr('el', elAttr);
            },
            100
          );
        }
      },
      handleVisibility: function(eventName) {
        // Supported modules
        let type_module = {
          'dashboard': pgAdmin.Dashboard,
          'statistics': pgBrowser.NodeStatistics,
          'dependencies': pgBrowser.NodeDependencies,
          'dependents': pgBrowser.NodeDependents,
        };

        let module = type_module[this._type];
        if(_.isUndefined(module))
          return;

        if(_.isUndefined(module.toggleVisibility))
          return;

        if (eventName == 'panelClosed') {
          /* Pass the closed flag also */
          module.toggleVisibility.call(module, false, true);
        } else if (eventName == 'panelVisibilityChanged') {
          module.toggleVisibility.call(module, pgBrowser.docker.findPanels(this._type)[0].isVisible(), false);
        }
      },

    });

    return pgAdmin.Browser.Panel;
  });
