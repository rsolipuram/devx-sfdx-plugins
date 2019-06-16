import { flags, SfdxCommand, core } from '@salesforce/command';
import { Messages, SfdxError, SfdxProjectJson, fs } from '@salesforce/core';
import { AnyJson, JsonArray, JsonCollection, JsonMap } from '@salesforce/ts-types';
import * as _ from 'lodash';
import path = require('path');
import fsn = require('fs');
const spawn = require('child-process-promise').spawn;

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raghav-sfdx-plugin', 'assertCoverage');

export default class Open extends SfdxCommand {

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

  private defaultPackageWaitTime:Number = 3000;
  private defaultTestLevel = 'RunLocalTests';
  private reset = '\x1b[0m';
  private red = '\x1b[31m';
  private green = '\x1b[32m'

  public async run(): Promise<AnyJson> { 

    this.ux.styledHeader("Identifying test classes in the package:")
    this.ux.startSpinner("");
    const packageTestClasses =  new Set(this.searchFilesInDirectory(".", "isTest", ".cls"));
    this.ux.stopSpinner();

    const args = [];
    args.push('force:apex:test:run');

    args.push('--testlevel');
    args.push(this.flags.testlevel != null ? this.flags.testlevel : this.defaultTestLevel);

    args.push('--resultformat');
    args.push('human');

    args.push('--wait');
    args.push(this.flags.wait != null ? this.flags.wait : this.defaultPackageWaitTime);

    args.push('--outputdir');
    args.push('testResults');

    args.push('--json');
    args.push('--codecoverage');

    this.ux.startSpinner(`Executing run tests command: sfdx ${args.join(" ")}`);
    await spawn("sfdx", args, { stdio: ['ignore', 'ignore', process.stderr]});
    this.ux.stopSpinner("Done");

    const minimumTestCoverage = this.flags.classcoverage != null ? this.flags.classcoverage : 90;
    const coverages = await core.fs.readJson("testResults/test-result-codecoverage.json") as JsonCollection;

    let coverageMap = {};
    let errors = 0;

    _.forEach(coverages, (c) => {
      const coverage = c as JsonMap;
      if( coverage.coveredPercent < minimumTestCoverage )
      {
        if(packageTestClasses.has(coverage.name.toString()))
        {
          coverageMap[coverage.name.toString()] = coverage.coveredPercent;
          console.error(`Coverage for ${coverage.name} is ${this.red} ${coverage.coveredPercent} ${this.reset} ${minimumTestCoverage}% required`);
          errors++;
        }
        else
        {
          console.warn(`Coverage for ${coverage.name} is ${this.red} ${coverage.coveredPercent} ${this.reset} ${minimumTestCoverage}% required`);
        }
      }
      else
      {
        console.log(`Coverage for ${coverage.name} is ${this.green} ${coverage.coveredPercent} ${this.reset}`);
      }
    });

    if(errors)
    {
      throw new core.SfdxError(`Some classes are below the minimum coverage of ${minimumTestCoverage}%`);
    }
    else
    {
      console.log(`${this.green}All classes are above the minimum of ${minimumTestCoverage}%${this.reset}`);
    }
    // Return an object to be displayed with --json
    return {minimumTestCoverage, coverageMap};   
  }
  
  private searchFilesInDirectory(dir: fsn.PathLike, filter: string, ext: any):Array<String> {
    let testClassess:Array<String> = [];
    if (!fsn.existsSync(dir)) {
        console.log(`Specified directory: ${dir} does not exist`);
        return;
    }

    const found = this.getFilesInDirectory(dir, ext);
    found.forEach(file => {
        const fileContent = fsn.readFileSync(file).toString();

        // We want full words, so we use full word boundary in regex.
        const regex = new RegExp('\\b' + filter + '\\b');
        if (regex.test(fileContent)) {
          console.log(file);
          testClassess.push(path.basename(file.toString(), ".cls"));
        }
    });
    return testClassess;
  }

  // Using recursion, we find every file with the desired extention, even if its deeply nested in subfolders.
  private getFilesInDirectory(dir, ext):any[] {
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
                console.log(`./${filePath}`);
            }
        }
    });
    return files;
  }
}