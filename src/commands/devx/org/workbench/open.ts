import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError, SfdxProjectJson } from '@salesforce/core';
import { AnyJson, JsonArray, JsonCollection, JsonMap } from '@salesforce/ts-types';
import * as url from "url";
import * as open from 'open';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('devx', 'open');

export default class Open extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [];

  protected static flagsConfig = {
  };

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  protected static requiresProject = true;
  
  protected static varargs = false;

  public async run(): Promise<AnyJson> { 
    const org = this.org;
    const conn = org.getConnection();
    await org.refreshAuth();

    const accessToken = conn.accessToken;
    const serverUrl = `${conn.instanceUrl}/services/Soap/u/41.0`;
    const workbenchUrlWithToken = `https://workbench.developerforce.com/login.php?serverUrl=${serverUrl}&sid=${accessToken}`

    this.ux.log(`opening workbench ${workbenchUrlWithToken}`);
    open(workbenchUrlWithToken);
    
    return { workbenchUrlWithToken, username: org.getUsername() };   
  }
}