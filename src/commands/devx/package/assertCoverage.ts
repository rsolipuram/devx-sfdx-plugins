import { flags, SfdxCommand, core } from '@salesforce/command';
import { Messages, SfdxError, SfdxProjectJson, fs } from '@salesforce/core';
import { AnyJson, JsonArray, JsonCollection, JsonMap } from '@salesforce/ts-types';
import * as _ from 'lodash';
import path = require('path');
import fsn = require('fs');
const chalk = require('chalk');
import {ApexTestRunCommand} from 'salesforce-alm/dist/commands/force/apex/test/run';
import intercept = require("intercept-stdout");
import ora = require('ora');

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('devx-sfdx-plugin', 'assertCoverage');

enum StdoutCaptureState {
  "Capturing",
  "NotCapturing"
}

export default class assertCoverage extends SfdxCommand {

  private stdoutCaptureStatus:StdoutCaptureState;
  private logs:string[];

  public static description = messages.getMessage('commandDescription');

  public static examples = [];

  protected static flagsConfig = {
    wait: flags.number({ char: 'w', required: false, description: 'Maximum number of minutes to wait for installation status. The default is 3000.' }),
    testlevel: flags.enum({ char: 'l', required: false, 
    description: `Specifies which tests to run, using one of these TestLevel enum values:
      RunSpecifiedTests—Only the tests that you specify are run.
      RunLocalTests—All tests in your org are run, except the ones that originate from installed managed packages.
      RunAllTestsInOrg—All tests are in your org and in installed managed packages are run.`,
    options: ['RunLocalTests', 'RunAllTestsInOrg', 'RunSpecifiedTests'] }),
    orgcoverage: flags.number({ char: 'o', required: true, description: 'Minimum average org code coverage to meet' }),
    classcoverage: flags.number({ char: 'c', required: true, description: 'Minimum class code coverage to meet' })
  };

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  protected static requiresProject = true;
  
  protected static varargs = false;

  private defaultPackageWaitTime:String = "3000";
  private defaultTestLevel = 'RunLocalTests';

  public async run(): Promise<Array<ClassCoverage>> { 

    const commandArgs = this.prepareCommandArgs();
     
    let spinner = this.startSpinner("Identifying test classes in the package:")
    const packageTestClasses =  new Set(this.searchFilesInDirectory(".", null, ".cls"));
    console.log(packageTestClasses);
    spinner.succeed("");

    this.ux.startSpinner(`Executing run tests command: sfdx ${commandArgs.join(" ")}`);
    this.startIntercrpt();
    await ApexTestRunCommand.run(commandArgs);
    this.stopIntercept();
    this.ux.stopSpinner("Done");

    const minimumTestCoverage = this.flags.classcoverage != null ? this.flags.classcoverage : 90;
    const coverages = await core.fs.readJson("testResults/test-result-codecoverage.json") as JsonCollection;

    let errors = 0;
    let clsCoverages:Array<ClassCoverage> = new Array<ClassCoverage>();

    _.forEach(coverages, (c) => {
      const coverage = c as JsonMap;
      let clsCoverage:ClassCoverage = {
        className : coverage.name.toString(),
        coverage: coverage.coveredPercent.toString(),
      };

      if( coverage.coveredPercent < minimumTestCoverage )
      {
        if(packageTestClasses.has(coverage.name.toString()))
        {
          clsCoverage.coverageStatus = `${chalk.red(coverage.coveredPercent.toString())}`;
          errors++;
        }
        else
        {
          clsCoverage.coverageStatus = `${chalk.yellow(coverage.coveredPercent.toString())}`;
        }
      }
      else
      {
        clsCoverage.coverageStatus = `${chalk.green(coverage.coveredPercent.toString())}`;
      }

      clsCoverages.push(clsCoverage);
    });

    this.ux.table(clsCoverages, ['className', 'coverageStatus']);    
    

    if(errors)
    {
      throw new core.SfdxError(`Some classes are below the minimum coverage of ${minimumTestCoverage}%`);
    }
    else
    {
      console.log(`${chalk.green('All classes are above the minimum of '+ minimumTestCoverage)}`);
    }

    clsCoverages.forEach(function(v){ 
      delete v.coverageStatus; 
    });

    return clsCoverages;   
  }

  private prepareCommandArgs():any[]
  {
    const args = [];

    args.push('--testlevel');
    args.push(this.flags.testlevel != null ? this.flags.testlevel : this.defaultTestLevel);

    args.push('--resultformat');
    args.push('human');

    args.push('--wait');
    args.push(this.flags.wait != null ? this.flags.wait : this.defaultPackageWaitTime);

    args.push('--outputdir');
    args.push('testResults');

    args.push('--codecoverage');
    return args;
  }
  
  private searchFilesInDirectory(dir: fsn.PathLike, filter: string, ext: any):Array<String> {
    let files:Array<String> = [];
    if (!fsn.existsSync(dir)) {
        console.log(`Specified directory: ${dir} does not exist`);
        return;
    }

    const found = this.getFilesInDirectory(dir, ext);
    found.forEach(file => {
        if(filter == null)
        {
          files.push(path.basename(file.toString(), ".cls"));
        }
        else
        {
          const fileContent = fsn.readFileSync(file).toString();
          const regex = new RegExp('\\b' + filter + '\\b');
          if (regex.test(fileContent)) {
            files.push(path.basename(file.toString(), ".cls"));
          }
       }
    });
    return files;
  }

  private startIntercrpt()
  {
    this.stdoutCaptureStatus = StdoutCaptureState.Capturing;
    intercept((text: any) =>{
      this.logs.push(text);
      if(this.stdoutCaptureStatus == StdoutCaptureState.Capturing)
      {
        return '';
      }
    });
  }

  private stopIntercept()
  {
    this.stdoutCaptureStatus = StdoutCaptureState.NotCapturing;
  }

  private startSpinner(text:string):any
  {
    return ora(text).start();
  }

  // Using recursion, we find every file with the desired extention, even if its deeply nested in subfolders.
  private getFilesInDirectory(dir: fsn.PathLike, ext: string):any[] {
    if (!fsn.existsSync(dir)) {
        console.log(`Specified directory: ${dir} does not exist`);
        return;
    }

    let files = [];
    fsn.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fsn.lstatSync(filePath);

        // If we hit a directory, apply our function to that dir. If we hit a file, add it to the array of files.
        if (stat.isDirectory()) {
            const nestedFiles = this.getFilesInDirectory(filePath, ext);
            files = files.concat(nestedFiles);
        } else {
            if (path.extname(file) === ext) {
                files.push(`./${filePath}`);
            }
        }
    });
    return files;
  }
}

interface ClassCoverage{
  className: string,
  coverage: string,
  coverageStatus?: string
}