// You'll need to use the actual plugin name and path here
import { SfdxCommand } from '@salesforce/command';
import * as test from 'salesforce-alm/dist/commands/force/apex/test/run' 

export default class assertTests extends SfdxCommand {
  async run() {

const Ora = require('.');

const spinner = new Ora({
	text: 'Loading unicorns',
	spinner: process.argv[2]
});

spinner.start();

setTimeout(() => {
	spinner.color = 'yellow';
}, 1000);

setTimeout(() => {
	spinner.color = 'green';
	spinner.indent = 2;
	spinner.text = 'Loading with indent';
}, 2000);

setTimeout(() => {
	spinner.indent = 0;
	spinner.spinner = 'moon';
	spinner.text = 'Loading with different spinners';
}, 3000);

setTimeout(() => {
	spinner.succeed();
}, 4000);
    
    /*
    var green = '\u001b[42m \u001b[0m';
    var red = '\u001b[41m \u001b[0m';
    
    var ProgressBar = require('progress')
    , bar         = new ProgressBar('  [:bar]', 10);
  
  var id = setInterval(function (){
    bar.tick();
    if (bar.complete) {
      clearInterval(id);
    }
  }, 100);

    const ora = require('ora');

    const throbber = ora('Rounding up all the alligators').start();
    */
   
    
    const args = [];

    args.push('--testlevel');
    args.push('RunLocalTests');

    args.push('--resultformat');
    args.push('json');

    args.push('--outputdir');
    args.push('testResults');

    args.push('--wait');
    args.push('100');
    
    args.push('--json');
    args.push('--codecoverage');

    this.ux.startSpinner('Retrieving Metadata...');
   await test.ApexTestRunCommand.run(args);
   this.ux.stopSpinner();
   
   const ora = require('ora');

const throbber = ora({
  text: 'Rounding up all the reptiles',
  spinner: {
    frames: ['🐊', '🐢', '🦎', '🐍'],
    interval: 300, // Optional
  },
}).start();

// Simulating some asynchronous work for 10 seconds...
setTimeout(() => {
  throbber.stop();
}, 1000 * 10);
  }
}