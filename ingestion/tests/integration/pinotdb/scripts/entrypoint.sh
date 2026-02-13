#!/usr/bin/env bash

handle_sigterm() {
  echo 'Handling SIGTERM/SIGINT. Stopping all processes'
  ./bin/pinot-admin.sh StopProcess -controller -broker -server
}

trap handle_sigterm SIGTERM SIGINT

mkdir -p /var/log/pinot-local

./bin/pinot-admin.sh StartZookeeper -zkPort 2181 > /var/log/pinot-local/zookeeper.log 2> /var/log/pinot-local/zookeeper.err &
sleep 2
./bin/pinot-admin.sh StartController -zkAddress localhost:2181 > /var/log/pinot-local/controller.log 2> /var/log/pinot-local/controller.err &
sleep 2
./bin/pinot-admin.sh StartBroker -zkAddress localhost:2181 > /var/log/pinot-local/broker.log 2> /var/log/pinot-local/broker.err &
sleep 2
./bin/pinot-admin.sh StartServer -zkAddress localhost:2181
