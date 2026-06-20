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
        // [Node 1] Mulai function recordFilesBatch()
        
        // [Node 2] Mengecek apakah panjang array _ipfsHashes, _fileNames, dan _fileHashes sama
        require(
            _ipfsHashes.length == _fileNames.length && 
            _fileNames.length == _fileHashes.length,
            "ArrayLengthMismatch" // [Node 2a] Revert: ArrayLengthMismatch
        );
        
        // [Node 3] Mengecek apakah batch tidak kosong
        require(_ipfsHashes.length > 0, "EmptyBatch"); // [Node 3a] Revert: EmptyBatch
        
        // [Node 4] Mengecek apakah jumlah file tidak lebih dari 10
        require(_ipfsHashes.length <= 10, "BatchTooLarge"); // [Node 4a] Revert: BatchTooLarge

        // [Node 5] Inisialisasi perulangan i = 0
        // [Node 6] Mengecek kondisi loop i < _ipfsHashes.length
        for (uint256 i = 0; i < _ipfsHashes.length; i++) {
            _recordSingle(_ipfsHashes[i], _fileNames[i], _fileHashes[i]);
        }

        // [Node 10] Emit event BatchFilesRecorded
        emit BatchFilesRecorded(_ipfsHashes.length, msg.sender);
        
        // [Node 11] Selesai / Exit
    }

    function _recordSingle(
        string calldata _ipfsHash,
        string calldata _fileName,
        string calldata _fileHash
    ) private {
        // [Node 7] Mengecek apakah file hash belum pernah tercatat
        require(!isFileExists[_fileHash], "DuplicateContent"); // [Node 7a] Revert: DuplicateContent
        
        // [Node 8] Mengecek apakah CID IPFS belum memiliki owner
        require(filesByIPFS[_ipfsHash].owner == address(0), "DuplicateCID"); // [Node 8a] Revert: DuplicateCID

        // [Node 9] Menyimpan record file, mengubah isFileExists, dan emit FileRecorded
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