// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title QevorAgentIdentityRegistry
/// @notice Minimal ERC-721-compatible identity registry for Qevor's ERC-8004 Mantle agent.
contract QevorAgentIdentityRegistry {
    string public constant name = "Qevor Agent Identity Registry";
    string public constant symbol = "QEVOR-AGENT";

    address public owner;
    uint256 public nextAgentId = 1;

    mapping(uint256 => address) private owners;
    mapping(uint256 => string) private uris;
    mapping(uint256 => address) public agentWalletOf;
    mapping(address => uint256) public agentIdOfWallet;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AgentRegistered(uint256 indexed agentId, address indexed agentWallet, string agentURI);
    event AgentURIUpdated(uint256 indexed agentId, string agentURI);

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), owner);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f;
    }

    function ownerOf(uint256 agentId) public view returns (address) {
        address currentOwner = owners[agentId];
        require(currentOwner != address(0), "NONEXISTENT_AGENT");
        return currentOwner;
    }

    function tokenURI(uint256 agentId) external view returns (string memory) {
        ownerOf(agentId);
        return uris[agentId];
    }

    function agentURI(uint256 agentId) external view returns (string memory) {
        ownerOf(agentId);
        return uris[agentId];
    }

    function registerAgent(address agentWallet, string calldata agentURI_) external onlyOwner returns (uint256 agentId) {
        require(agentWallet != address(0), "ZERO_AGENT_WALLET");
        require(agentIdOfWallet[agentWallet] == 0, "AGENT_ALREADY_REGISTERED");

        agentId = nextAgentId++;
        owners[agentId] = owner;
        uris[agentId] = agentURI_;
        agentWalletOf[agentId] = agentWallet;
        agentIdOfWallet[agentWallet] = agentId;
        balanceOf[owner] += 1;

        emit Transfer(address(0), owner, agentId);
        emit AgentRegistered(agentId, agentWallet, agentURI_);
    }

    function setAgentURI(uint256 agentId, string calldata agentURI_) external onlyOwner {
        ownerOf(agentId);
        uris[agentId] = agentURI_;
        emit AgentURIUpdated(agentId, agentURI_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_OWNER");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
