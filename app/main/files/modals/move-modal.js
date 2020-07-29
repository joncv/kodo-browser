angular.module('web')
  .controller('moveModalCtrl', ['$scope', '$uibModalInstance', '$timeout', '$translate', 'items', 'isCopy', 'renamePath', 'fromInfo', 'moveTo', 'callback', 's3Client', 'Toast', 'safeApply', 'AuditLog',
    function ($scope, $modalInstance, $timeout, $translate, items, isCopy, renamePath, fromInfo, moveTo, callback, s3Client, Toast, safeApply, AuditLog) {
      const path = require("path"),
            filter = require("array-filter"),
            map = require("array-map"),
            T = $translate.instant;

      angular.extend($scope, {
        renamePath: renamePath,
        fromInfo: fromInfo,
        items: items,
        isCopy: isCopy,
        step: 2,

        cancel: cancel,
        start: start,
        stop: stop,

        moveTo: {
          region: moveTo.region,
          bucket: moveTo.bucket,
          key: moveTo.key,
        },
        canMove: false
      });

      //$scope.originPath = 'kodo://'+currentInfo.bucket+'/'+currentInfo.key;
      start();

      function stop() {
        //$modalInstance.dismiss('cancel');
        $scope.isStop = true;
        s3Client.stopCopyFiles();
      }

      function cancel() {
        $modalInstance.dismiss('cancel');
      }

      function start() {
        $scope.isStop = false;
        $scope.step = 2;

        const target = angular.copy($scope.moveTo);
        let archivedFiles = [];
        let items = filter(angular.copy($scope.items), (item) => {
          if (fromInfo.bucket !== target.bucket) {
            return true;
          }
          let entries = filter([target.key, item.name], (name) => { return name });
          let path = map(entries, (name) => { return name.replace(/^\/*([^/].+[^/])\/*$/, '$1'); }).join('/');
          if (item.isFolder) {
            return item.path !== path + '/';
          }
          return item.path !== path;
        });

        if (items.length === 0) {
          $timeout(() => {
            cancel();
            callback();
          });
          return;
        }

        angular.forEach(items, (n) => {
          n.bucket = fromInfo.bucket;
        });

        items = items.filter((n) => {
          if (n.StorageClass && n.StorageClass.toLowerCase() === 'glacier') {
            archivedFiles = archivedFiles.concat([n]);
            return false;
          } else {
            return true;
          }
        });

        AuditLog.log('moveOrCopyFilesStart', {
          regionId: fromInfo.region,
          from: map(items, (item) => {
            return { bucket: item.bucket, path: item.path };
          }),
          to: {
            bucket: target.bucket,
            path: target.key
          },
          type: isCopy ? 'copy' : 'move'
        });

        //复制 or 移动
        let archivedFilesAdded = false;
        s3Client.copyFiles(fromInfo.region, items, target, (prog) => {
          //进度
          if (!archivedFilesAdded) {
            if (prog.total !== undefined) {
              prog.total += archivedFiles.length;
            }
            if (prog.errorCount !== undefined) {
              prog.errorCount += archivedFiles.length;
            }
            archivedFilesAdded = true;
          }
          $scope.progress = angular.copy(prog);
          safeApply($scope);
        }, !isCopy, renamePath).then((terr) => {
          //结果
          terr = archivedFiles.map((file) => {
            return { error: new Error(T('copy.move.archived.error1')), item: file };
          }).concat(terr);
          $scope.step = 3;
          $scope.terr = terr;
          AuditLog.log('moveOrCopyFilesDone');
          callback();
        });
      }
    }
  ]);
