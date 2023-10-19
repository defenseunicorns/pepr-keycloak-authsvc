#!/bin/bash

HOSTNAME="http://localhost:8080/auth"


#########################################################
#   AUTHORIZATION EXAMPLE TO BE USED FOR ACCESS TOKEN   #
#########################################################
# Perform the first cURL request to obtain the access token
response=$(curl -I -s -X POST "$HOSTNAME/realms/master/protocol/openid-connect/token" \
  -d "username=admin" \
  -d "password=password" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -H "Content-Type: application/x-www-form-urlencoded")

# Get the HTTP status code from the response headers
http_status_code=$(echo "$response" | grep -i "HTTP/" | awk '{print $2}')

echo $http_status_code
echo ""





#############################################
#   DELETE CLIENT BY GETTING ITS CLIENTID   #
#############################################
# Extract the access token from the response (assuming it's in JSON format)
# ACCESS_TOKEN=$(echo "$response" | jq -r '.access_token')

# response2=$(curl -X GET $HOSTNAME/admin/realms/master/clients?clientId=podinfo \
#             -H "Content-Type: application/json" \
#             -H "Authorization: Bearer $ACCESS_TOKEN")

# echo "client id array:"
# echo $response2
# echo ""

# CLIENT_ID=$(echo "$response2" | jq -r '.[0].id')

# echo ""
# echo "client id:"
# echo $CLIENT_ID
# echo ""

# # Perform the second cURL request with the access token
# curl -X DELETE "$HOSTNAME/admin/realms/master/clients/$CLIENT_ID" \
#   -H "Authorization: Bearer $ACCESS_TOKEN"

# echo ""
# echo ""






#############################################
#   CREATE A REALM FROM CONFIGMAP EXAMPLE   #
#############################################
# input_file="realm-export.json"
# if [ ! -f "$input_file" ]; then
#   echo "Input file not found: $input_file"
#   exit 1
# fi

# # Read the JSON file content into a variable
# json_data=$(cat "$input_file")

# response=$(curl -X POST "$HOSTNAME/admin/realms" \
#   -d "$json_data" \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer $ACCESS_TOKEN")

#   echo ""
#   echo ""