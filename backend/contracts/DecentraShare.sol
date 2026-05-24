pragma solidity ^0.8.20;

contract DecentraShare {
    struct FileRecord {
        string ipfsHash;
        string fileName;
        string fileHash;
        address owner;
        uint256 timestamp;
    }

    mapping(string => FileRecord) public filesByIPFS;
    mapping(string => bool) public isFileExists;

    event FileRecorded(string indexed ipfsHash, string indexed fileHash, address indexed owner);
    event BatchFilesRecorded(uint256 count, address indexed owner);

    function recordFile(
        string calldata _ipfsHash,
        string calldata _fileName,
        string calldata _fileHash
    ) external {
        _recordSingle(_ipfsHash, _fileName, _fileHash);
    }

    function recordFilesBatch(
        string[] calldata _ipfsHashes,
        string[] calldata _fileNames,
        string[] calldata _fileHashes
    ) external {
        require(
            _ipfsHashes.length == _fileNames.length && 
            _fileNames.length == _fileHashes.length,
            "ArrayLengthMismatch"
        );
        require(_ipfsHashes.length > 0, "EmptyBatch");
        require(_ipfsHashes.length <= 10, "BatchTooLarge"); 

        for (uint256 i = 0; i < _ipfsHashes.length; i++) {
            _recordSingle(_ipfsHashes[i], _fileNames[i], _fileHashes[i]);
        }

        emit BatchFilesRecorded(_ipfsHashes.length, msg.sender);
    }

    function _recordSingle(
        string calldata _ipfsHash,
        string calldata _fileName,
        string calldata _fileHash
    ) private {
        require(!isFileExists[_fileHash], "DuplicateContent");
        require(filesByIPFS[_ipfsHash].owner == address(0), "DuplicateCID");

        filesByIPFS[_ipfsHash] = FileRecord({
            ipfsHash: _ipfsHash,
            fileName: _fileName,
            fileHash: _fileHash,
            owner: msg.sender,
            timestamp: block.timestamp
        });

        isFileExists[_fileHash] = true;
        emit FileRecorded(_ipfsHash, _fileHash, msg.sender);
    }

    function verifyOwner(string calldata _ipfsHash) external view returns (address) {
        return filesByIPFS[_ipfsHash].owner;
    }

    function checkFileExists(string calldata _fileHash) external view returns (bool) {
        return isFileExists[_fileHash];
    }
}