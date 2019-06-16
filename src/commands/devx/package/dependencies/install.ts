import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError, SfdxProjectJson } from '@salesforce/core';
import { AnyJson, JsonArray, JsonCollection, JsonMap } from '@salesforce/ts-types';
const spawn = require('child-process-promise').spawn;

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raghav-sfdx-plugin', 'install');

export default class Install extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [];

  protected static flagsConfig = {
    wait: flags.number({ char: 'w', required: false, description: 'Maximum number of minutes to wait for installation status. The default is 3000.' }),
    noprompt: flags.boolean({ char: 'r', required: false, description: 'Allows the following without an explicit confirmation response: 1) Remote Site Settings and Content Security Policy websites to send or receive data, and 2) --upgradetype Delete to proceed.' }),
    publishwait: flags.number({ char: 'w', required: false, description: 'Maximum number of minutes to wait for the Subscriber Package Version ID to become available in the target org before canceling the install request. The default is 0.' })
  };

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  protected static requiresProject = true;
  
  protected static varargs = false;

  private defaultPackageWaitTime:Number = 3000;


  public async run(): Promise<AnyJson> {    
    this.ux.styledHeader(`Fetching packages already installed in the org: `);
    this.ux.startSpinner('');
    const installedPackages: Array<InstalledPackage> = await this.getInstalledPackageVersions();
    this.ux.stopSpinner();    
    this.ux.table(installedPackages, ['packageId', 'packageName', 'majorVersion', 'minorVersion', 'patchVersion', 'buildNumber']);    
    this.ux.log('\n');

    let installedPackageIds = new Set(installedPackages.map(a => a.packageId));
    
    this.ux.styledHeader(`Analyzing project json`);
    const projectJson = await this.project.retrieveSfdxProjectJson();
    const packageDepencies:Array<String> = this.getPackageDependencies(projectJson) || [];
    const packageAlias:JsonMap = projectJson.get("packageAliases") as JsonMap;

    this.ux.styledHeader(`Starting package depencies in order`);

    for(let packageDepency of packageDepencies)
    {
        const packageVersionId = packageAlias[packageDepency.toString()] as string;

        if(installedPackageIds.has(packageVersionId))
        {
            this.ux.log(`${packageDepency} - ${packageVersionId} is already installed, Skipping Installation`);
            if(this.flags.noprompt != null)
            {
              continue;
            }

            const reinstall:boolean = await this.ux.confirm(`Do you want to reinstall ?`);
            if(! reinstall)
            {
              continue;
            }
        }

        const args = [];
        args.push('force:package:install');

        args.push('--package');
        args.push(`${packageVersionId}`);

        args.push('--wait');
        args.push(this.flags.wait != null ? this.flags.wait : this.defaultPackageWaitTime)

        if(this.flags.publishwait != null)
        {
           args.push('--publishwait');
           args.push(this.flags.publishwait);
        }
        
        if(this.flags.noprompt !=null)
        {
           args.push('--noprompt');
        }

        this.ux.log(`Executing command: sfdx ${args.join(" ")}`);
        await spawn("sfdx", args, { stdio: "inherit" });
        this.ux.stopSpinner("Done");
    }

    return {};
  } 


  private async getInstalledPackageVersions(): Promise<Array<InstalledPackage>>{
    let installedPackages:Array<InstalledPackage> = new Array<InstalledPackage>();
    const query = `SELECT Id, SubscriberPackageId, SubscriberPackage.NamespacePrefix,
                      SubscriberPackage.Name, SubscriberPackageVersion.Id,
                      SubscriberPackageVersion.Name, SubscriberPackageVersion.MajorVersion,
                      SubscriberPackageVersion.MinorVersion,
                      SubscriberPackageVersion.PatchVersion,
                      SubscriberPackageVersion.BuildNumber
                  FROM InstalledSubscriberPackage
                  ORDER BY SubscriberPackageId `;
    const orgConnection = this.org.getConnection();
    const queryRecords = <any[]> (await orgConnection.tooling.query(query)).records
    for(let record of queryRecords)
    {
      let installedPck:InstalledPackage = {
          packageId: record.SubscriberPackageVersion.Id,
          packageName: record.SubscriberPackageVersion.Name,
          majorVersion: record.SubscriberPackageVersion.MajorVersion,
          minorVersion:record.SubscriberPackageVersion.MinorVersion,
          patchVersion:record.SubscriberPackageVersion.PatchVersion,
          buildNumber:record.SubscriberPackageVersion.BuildNumber
      }
      installedPackages.push(installedPck);
    }  
    return installedPackages; 
  }
  
  private getPackageDependencies(projectJson : SfdxProjectJson) : Array<String> {
    let packageDepenciesToInstall:Array<String> = new Array<String>();
    const packageDirectories = projectJson.get("packageDirectories") as JsonArray;

    packageDirectories.forEach(jsonElement => {
        const packageDirectory = jsonElement as JsonMap;
        const packageDependencies = packageDirectory.dependencies as JsonArray || [];

        this.ux.styledHeader(`Package dependencies for ${packageDirectory.path}`);

        if(packageDependencies.length == 0)
        {
          this.ux.log(`None Specified`);
        }
        else
        {
            packageDependencies.forEach(jsonElement => {
            const packageDependency = jsonElement as JsonMap;
            packageDepenciesToInstall.push(<String>packageDependency.package);
  
            this.ux.log(`${packageDependency.package}`);
          });
        }

        this.ux.log('');
    } );

    return packageDepenciesToInstall;
  } 
  
}

interface InstalledPackage{
  packageId: string,
  packageName: string,
  majorVersion: string,
  minorVersion: string,
  patchVersion: string,
  buildNumber: string
}
