# Karabo's connection to Microsoft Foundry, for a local run.
#
# Copy this file to karabo.local.ps1 in the same folder and fill in the three values. run-local.ps1
# reads karabo.local.ps1 if it exists. That file is in .gitignore: never commit it, and never put
# the key anywhere under frontend/, where Vite would copy it into the browser bundle.
#
# All three come from the Foundry portal, on the page of the model deployment:
#
#   Endpoint     the resource endpoint, https://<resource>.openai.azure.com, with nothing after it
#   Deployment   the name YOU gave the deployment under "Models + endpoints", not the model name
#   Key          either key under "Keys and Endpoint"
#
# In a deployment, do not use AZURE_OPENAI_API_KEY at all. Mount the key as a file and set
# AZURE_OPENAI_API_KEY_FILE to its path instead, as for every other secret in Vuka.

$env:AZURE_OPENAI_ENDPOINT = 'https://your-resource.openai.azure.com'
$env:AZURE_DEPLOYMENT_NAME = 'your-deployment-name'
$env:AZURE_OPENAI_API_KEY  = 'paste-your-key-here'


# Optional. Whether someone who is not signed in may ask at all (true or false). Either way they
# only ever reach what the Department has published.
# $env:KARABO_PUBLIC_ENABLED = 'true'

# Optional. The public cost ceiling: questions per minute and per day from one address.
# $env:KARABO_PER_MINUTE_PUBLIC = '6'
# $env:KARABO_PER_DAY_PUBLIC    = '60'
