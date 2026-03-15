// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DecentraShare {
    struct FileRecord {
        string ipfsHash;  
        string fileName;    
        string fileHash;    
        address owner;      
        uint256 timestamp;  
    }

    // Mapping berdasarkan IPFS Hash (untuk akses file)
    mapping(string => FileRecord) public filesByIPFS;
    
    // Mapping berdasarkan SHA-256 (untuk cek duplikasi isi file)
    mapping(string => bool) public isFileExists;

    event FileRecorded(string ipfsHash, string fileHash, address indexed owner);

    function recordFile(
        string memory _ipfsHash, 
        string memory _fileName, 
        string memory _fileHash // Input SHA-256 dari backend
    ) public {
        // CEK 1: Apakah isi file ini sudah pernah ada? (Anti-Duplicate)
        require(!isFileExists[_fileHash], "Isi file ini sudah pernah di-upload sebelumnya!");
        
        // CEK 2: Apakah CID IPFS ini sudah terdaftar?
        require(filesByIPFS[_ipfsHash].owner == address(0), "CID IPFS ini sudah terdaftar!");

        filesByIPFS[_ipfsHash] = FileRecord({
            ipfsHash: _ipfsHash,
            fileName: _fileName,
            fileHash: _fileHash,
            owner: msg.sender,
            timestamp: block.timestamp
        });

        // Tandai bahwa hash file ini sudah terdaftar
        isFileExists[_fileHash] = true;

        emit FileRecorded(_ipfsHash, _fileHash, msg.sender);
    }

    function verifyOwner(string memory _ipfsHash) public view returns (address) {
        return filesByIPFS[_ipfsHash].owner;
    }
}