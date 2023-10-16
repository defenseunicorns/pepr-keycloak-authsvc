import test from "ava";
import util from 'util';
import { exec } from 'child_process';

// run shell command asynchronously
const execAsync = util.promisify(exec);


test("E2E Test: Create New Client from Generic Secret", async t => {

  // Define the kubcetl command to create new secret to test integration
  const createSecret = 'kubectl create secret generic client2 --from-literal=realm=baby-yoda --from-literal=id=podinfo --from-literal=name=podinfo --from-literal=domain=bigbang.dev'
  const labelSecret = 'kubectl label secret client2 pepr.dev/keycloak=createclient';

  try{
    //Execute createSecret
    const {stdout, stderr} = await execAsync(createSecret);

    t.truthy(stdout, 'Kubectl command to create new secret produced output');
    t.falsy(stderr, 'kubectl command to create new secret produced no stderr output');

    // if creating the new secret was successful change the label to 
    // trigger pepr-keycloak-authsvc changes
    if(!stderr) {
      const { stdout: labelout, stderr: labelerr } = await execAsync(labelSecret);

      t.truthy(labelout, 'Kubectl command to label new secret produced output');
      t.falsy(labelerr, 'kubectl command to label new secret produced no stderr output');
    }

    // ToDo: add more tests for asserting that when the secret is relabeled it creates a new client
    // Get the newly created secret that should have been created by pepr-keycloak-authsvc and keycloak
    const getNewSecret = '';
    const { stdout: newSecretOut, stderr: newSecretErr } = await execAsync(getNewSecret);

    t.truthy(newSecretOut, 'Kubectl command to get new secret produced output');
    t.falsy(newSecretErr, 'kubectl command to get new secret produced no stderr output');

  } catch (e) {
    t.fail('Failed to run kubectl command without errors: '+e.message);
  }
});
