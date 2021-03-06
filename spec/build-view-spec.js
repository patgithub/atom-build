'use babel';
'use strict';

var fs = require('fs-extra');
var temp = require('temp');
var specHelpers = require('atom-build-spec-helpers');

describe('BuildView', function() {

  var directory = null;
  var workspaceElement = null;

  temp.track();

  beforeEach(function() {
    atom.config.set('build.buildOnSave', false);
    atom.config.set('build.panelVisibility', 'Toggle');
    atom.config.set('build.saveOnBuild', false);
    atom.config.set('build.stealFocus', true);
    atom.notifications.clear();

    workspaceElement = atom.views.getView(atom.workspace);
    jasmine.attachToDOM(workspaceElement);
    jasmine.unspy(window, 'setTimeout');
    jasmine.unspy(window, 'clearTimeout');

    runs(function() {
      workspaceElement = atom.views.getView(atom.workspace);
      jasmine.attachToDOM(workspaceElement);
    });

    waitsForPromise(function() {
      return specHelpers.vouch(temp.mkdir, { prefix: 'atom-build-spec-' }).then(function (dir) {
        return specHelpers.vouch(fs.realpath, dir);
      }).then(function (dir) {
        directory = dir + '/';
        atom.project.setPaths([ directory ]);
        return atom.packages.activatePackage('build');
      });
    });
  });

  afterEach(function () {
    fs.removeSync(directory);
  });

  describe('when output from build command should be viewed', function() {
    it('should color output according to ansi escape codes', function () {
      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'printf "\\033[31mHello\\e[0m World"'
      }));

      atom.commands.dispatch(workspaceElement, 'build:trigger');
      waitsFor(function () {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('success');
      });

      runs(function () {
        expect(workspaceElement.querySelector('.build .output > span').style.color.match(/\d+/g)).toEqual([ '187', '0', '0' ]);
      });
    });

    it('should output data even if no line break exists', function () {
      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'printf "data without linebreak"'
      }));

      atom.commands.dispatch(workspaceElement, 'build:trigger');
      waitsFor(function () {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('success');
      });

      runs(function () {
        expect(workspaceElement.querySelector('.build .output').textContent).toMatch(/data without linebreak/);
      });
    });

    it('should only break the line when an actual newline character appears', function () {
      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'node -e \'process.stdout.write("same"); setTimeout(function () { process.stdout.write(" line\\n") }, 200);\''
      }));

      atom.commands.dispatch(workspaceElement, 'build:trigger');
      waitsFor(function () {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('success');
      });

      runs(function () {
        var el = workspaceElement.querySelector('.build .output');
        /* Now we expect one line for the 'Executing...' row, one for the actual output and an empty one at the end. */
        var lines = el.textContent.split('\n');
        expect(lines.length).toEqual(3);
        expect(lines[1]).toEqual('same line');
      });
    });

    it('should escape HTML chars so the output is not garbled or missing', function() {
      expect(workspaceElement.querySelector('.build')).not.toExist();

      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'echo "<script type=\"text/javascript\">alert(\'XSS!\')</script>"'
      }));
      atom.commands.dispatch(workspaceElement, 'build:trigger');

      waitsFor(function() {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('success');
      });

      runs(function() {
        expect(workspaceElement.querySelector('.build')).toExist();
        expect(workspaceElement.querySelector('.build .output').innerHTML).toMatch(/&lt;script type="text\/javascript"&gt;alert\('XSS!'\)&lt;\/script&gt;/);
      });
    });
  });

  describe('when a build is triggered', function () {
    it('should include a timer of the build', function () {
      expect(workspaceElement.querySelector('.build')).not.toExist();

      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'echo "Building, this will take some time..." && sleep 30 && echo "Done!"'
      }));
      atom.commands.dispatch(workspaceElement, 'build:trigger');

      // Let build run for 1.2 second. This should set the timer at "at least" 1.2
      // which is expected below. If this waits longer than 2000 ms, we're in trouble.
      waits(1200);

      runs(function() {
        expect(workspaceElement.querySelector('.build-timer').textContent).toMatch(/1.\d/);

        // stop twice to abort the build
        atom.commands.dispatch(workspaceElement, 'build:stop');
        atom.commands.dispatch(workspaceElement, 'build:stop');
      });
    });
  });

  describe('when links are added', function () {
    it('should only add one link per text, even if multiple is requested', function () {
      expect(workspaceElement.querySelector('.build')).not.toExist();

      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'echo match1 match1 match1 && exit 1',
        errorMatch: 'match1'
      }));
      atom.commands.dispatch(workspaceElement, 'build:trigger');

      waitsFor(function() {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('error');
      });

      runs(function() {
        var output = workspaceElement.querySelector('.build .output');
        expect(output.children.length).toEqual(6);
        for (var i = 0; i < output.children.length; i++) {
          expect(output.children[i].id).toEqual('error-match-0-0');
        }
      });
    });
  });

  describe('when panel orientation is altered', function () {
    it('should show the panel at the bottom spot', function () {
      expect(workspaceElement.querySelector('.build')).not.toExist();
      atom.config.set('build.panelOrientation', 'Bottom');

      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'echo this will fail && exit 1',
      }));
      atom.commands.dispatch(workspaceElement, 'build:trigger');

      waitsFor(function() {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('error');
      });

      runs(function() {
        var bottomPanels = atom.workspace.getBottomPanels();
        expect(bottomPanels.length).toEqual(1);
        expect(bottomPanels[0].item.constructor.name).toEqual('BuildView');
      });
    });

    it('should show the panel at the bottom spot', function () {
      expect(workspaceElement.querySelector('.build')).not.toExist();
      atom.config.set('build.panelOrientation', 'Left');

      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'echo this will fail && exit 1',
      }));
      atom.commands.dispatch(workspaceElement, 'build:trigger');

      waitsFor(function() {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('error');
      });

      runs(function() {
        var panels = atom.workspace.getLeftPanels();
        expect(panels.length).toEqual(1);
        expect(panels[0].item.constructor.name).toEqual('BuildView');
      });
    });

    it('should show the panel at the bottom spot', function () {
      expect(workspaceElement.querySelector('.build')).not.toExist();
      atom.config.set('build.panelOrientation', 'Top');

      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'echo this will fail && exit 1',
      }));
      atom.commands.dispatch(workspaceElement, 'build:trigger');

      waitsFor(function() {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('error');
      });

      runs(function() {
        var panels = atom.workspace.getTopPanels();
        expect(panels.length).toEqual(1);
        expect(panels[0].item.constructor.name).toEqual('BuildView');
      });
    });

    it('should show the panel at the bottom spot', function () {
      expect(workspaceElement.querySelector('.build')).not.toExist();
      atom.config.set('build.panelOrientation', 'Right');

      fs.writeFileSync(directory + '.atom-build.json', JSON.stringify({
        cmd: 'echo this will fail && exit 1',
      }));
      atom.commands.dispatch(workspaceElement, 'build:trigger');

      waitsFor(function() {
        return workspaceElement.querySelector('.build .title') &&
          workspaceElement.querySelector('.build .title').classList.contains('error');
      });

      runs(function() {
        var panels = atom.workspace.getRightPanels();
        expect(panels.length).toEqual(1);
        expect(panels[0].item.constructor.name).toEqual('BuildView');
      });
    });
  });
});
