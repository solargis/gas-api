## Google Apps Script API

### About
This tiny library is designed to call Google Apps Script API
from node.js.

### Usage
As an sample we show how to add rows to Google Spreadsheet
from node.js script.   

#### Prepare sample script on Google
 1. Open [Google Drive](https://drive.google.com)
 1. Create new Spreadsheet.
 1. From a Spreadsheet open Script editor  
    (menu: *↦ Tools →  Script editor...*)
 1. Replace content of tab _Code.gs_ by:
    ```javascript
    // @OnlyCurrentDoc
    function insertRow(atPosition, rows) {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
     
      if (Array.isArray(atPosition)) {
        rows = atPosition;
        atPosition = sheet.getLastRow() + 1;
      }
      else if (atPosition <= 0) atPosition += sheet.getLastRow() + 1;
      if (!Array.isArray(rows[0])) rows = [rows];
      if (atPosition <= sheet.getLastRow()) {
        sheet.insertRowsBefore(atPosition, rows.length);
      }
        
      sheet.getRange(atPosition, 1, rows.length, rows[0].length).setValues(rows);
      
      return {
        rowsCountAfterInsertion: sheet.getLastRow(),
        insertedRowsCount: rows.length
      };
    }
    ```
    > **Node:** Annotation comments tells to google that _SpreasheetApp_ will use only active sheet.  
      It means more strict authorization permission.
 1. Choose project name on first saving (*↦ File → Save*)  
	![Dialog: Edit project name](./readme-resoureces/Dialog-EditProjectName.png)  
	Project name on this turorial is **Data from Node.js**.
 1. Deploy script (*↦ Publish → Deploy as API executable...*)  
    * In dialog _Deploy as API executable_ in section version fill some note, then press ___Deploy___.   
      ![Dialog: Deploy as API executable (empty)](./readme-resoureces/Dialog-DeployAsApiExecutable-empty.png)
    * After that dialog shows _Current API ID_. You will need it later to identify called script.  
      Copy it an close dialog by button ___Close___.
      ![Dialog: Deploy as API executable (version 1)](./readme-resoureces/Dialog-DeployAsApiExecutable-v1.png)
 1. TODO
