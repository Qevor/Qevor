// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title QevorAgentEscrow
/// @notice Mantle-native escrow for policy-gated agent payouts.
contract QevorAgentEscrow {
    bytes4 private constant ERC1271_MAGIC_VALUE = 0x1626ba7e;
    bytes4 private constant ERC1271_INVALID_VALUE = 0xffffffff;

    address public owner;
    address public executor;
    address public identityRegistry;
    uint256 public agentId;
    string public agentURI;
    bool public paused;

    uint256 public maxPaymentWei;
    uint256 public dailyLimitWei;
    uint256 public spentDay;
    bool private entered;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public spentDayByAccount;
    mapping(address => uint256) public spentTodayWei;
    mapping(bytes32 => bool) public executedPayments;
    mapping(bytes32 => bool) public recordedDecisions;

    event Deposited(address indexed account, address indexed sender, uint256 amount);
    event Withdrawn(address indexed account, address indexed recipient, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ExecutorUpdated(address indexed previousExecutor, address indexed newExecutor);
    event AgentIdentityUpdated(address indexed identityRegistry, uint256 indexed agentId);
    event AgentMetadataURIUpdated(string agentURI);
    event LimitsUpdated(uint256 maxPaymentWei, uint256 dailyLimitWei);
    event PausedUpdated(bool paused);
    event PaymentExecuted(
        bytes32 indexed paymentId,
        address indexed account,
        address indexed executor,
        address recipient,
        uint256 amount
    );
    event BatchExecuted(bytes32 indexed batchId, address indexed account, uint256 paymentCount, uint256 totalAmount);
    event DecisionRecorded(
        bytes32 indexed decisionId,
        bytes32 indexed paymentId,
        address indexed recipient,
        uint256 amount,
        uint8 outcome,
        bytes32 reasonHash,
        uint256 agentId
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    modifier onlyExecutor() {
        require(msg.sender == executor, "ONLY_EXECUTOR");
        _;
    }

    modifier notPaused() {
        require(!paused, "PAUSED");
        _;
    }

    modifier nonReentrant() {
        require(!entered, "REENTRANT_CALL");
        entered = true;
        _;
        entered = false;
    }

    constructor(address initialExecutor, uint256 initialMaxPaymentWei, uint256 initialDailyLimitWei) payable {
        owner = msg.sender;
        executor = initialExecutor == address(0) ? msg.sender : initialExecutor;
        maxPaymentWei = initialMaxPaymentWei;
        dailyLimitWei = initialDailyLimitWei;
        spentDay = _currentDay();

        emit OwnershipTransferred(address(0), owner);
        emit ExecutorUpdated(address(0), executor);
        emit LimitsUpdated(maxPaymentWei, dailyLimitWei);
        if (msg.value > 0) {
            balances[msg.sender] += msg.value;
            emit Deposited(msg.sender, msg.sender, msg.value);
        }
    }

    receive() external payable {
        _depositFor(msg.sender);
    }

    function depositFor(address account) external payable notPaused {
        _depositFor(account);
    }

    function setExecutor(address newExecutor) external onlyOwner {
        require(newExecutor != address(0), "ZERO_EXECUTOR");
        emit ExecutorUpdated(executor, newExecutor);
        executor = newExecutor;
    }

    function setAgentIdentity(address newIdentityRegistry, uint256 newAgentId) external onlyOwner {
        require(newIdentityRegistry != address(0), "ZERO_IDENTITY_REGISTRY");
        identityRegistry = newIdentityRegistry;
        agentId = newAgentId;
        emit AgentIdentityUpdated(newIdentityRegistry, newAgentId);
    }

    function setAgentIdentity(address newIdentityRegistry, uint256 newAgentId, string calldata newAgentURI)
        external
        onlyOwner
    {
        require(newIdentityRegistry != address(0), "ZERO_IDENTITY_REGISTRY");
        identityRegistry = newIdentityRegistry;
        agentId = newAgentId;
        agentURI = newAgentURI;
        emit AgentIdentityUpdated(newIdentityRegistry, newAgentId);
        emit AgentMetadataURIUpdated(newAgentURI);
    }

    function setAgentURI(string calldata newAgentURI) external onlyOwner {
        agentURI = newAgentURI;
        emit AgentMetadataURIUpdated(newAgentURI);
    }

    function agentIdentity() external view returns (address registry, uint256 id, string memory uri) {
        return (identityRegistry, agentId, agentURI);
    }

    /// @notice ERC-1271 signature validation so this escrow can be attached as a contract-based agent wallet.
    /// @dev The registry or verifier should pass the digest that was signed by the current escrow owner.
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return _recoverSigner(hash, signature) == owner ? ERC1271_MAGIC_VALUE : ERC1271_INVALID_VALUE;
    }

    function setLimits(uint256 newMaxPaymentWei, uint256 newDailyLimitWei) external onlyOwner {
        maxPaymentWei = newMaxPaymentWei;
        dailyLimitWei = newDailyLimitWei;
        emit LimitsUpdated(maxPaymentWei, dailyLimitWei);
    }

    function setPaused(bool newPaused) external onlyOwner {
        paused = newPaused;
        emit PausedUpdated(newPaused);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_OWNER");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function withdraw(address payable recipient, uint256 amount) external nonReentrant {
        require(recipient != address(0), "ZERO_RECIPIENT");
        _debit(msg.sender, amount);
        _send(recipient, amount);
        emit Withdrawn(msg.sender, recipient, amount);
    }

    function executePayment(bytes32 paymentId, address account, address payable recipient, uint256 amount)
        external
        onlyExecutor
        notPaused
        nonReentrant
    {
        _executePayment(paymentId, account, recipient, amount);
    }

    /// @notice Records an agent decision that does not execute a transfer.
    /// @param outcome 0 = blocked, 1 = cosign required, 2 = failed.
    function recordDecision(
        bytes32 decisionId,
        bytes32 paymentId,
        address recipient,
        uint256 amount,
        uint8 outcome,
        bytes32 reasonHash
    ) external onlyExecutor {
        require(decisionId != bytes32(0), "ZERO_DECISION_ID");
        require(!recordedDecisions[decisionId], "DECISION_ALREADY_RECORDED");
        require(outcome <= 2, "INVALID_OUTCOME");

        recordedDecisions[decisionId] = true;
        emit DecisionRecorded(decisionId, paymentId, recipient, amount, outcome, reasonHash, agentId);
    }

    function executeBatch(
        bytes32 batchId,
        address account,
        address payable[] calldata recipients,
        uint256[] calldata amounts
    )
        external
        onlyExecutor
        notPaused
        nonReentrant
    {
        require(batchId != bytes32(0), "ZERO_BATCH_ID");
        require(recipients.length == amounts.length, "LENGTH_MISMATCH");
        require(recipients.length > 0, "EMPTY_BATCH");

        uint256 totalAmount;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "ZERO_RECIPIENT");
            require(amounts[i] > 0, "ZERO_AMOUNT");
            totalAmount += amounts[i];
            for (uint256 j = i + 1; j < recipients.length; j++) {
                require(recipients[i] != recipients[j], "DUPLICATE_RECIPIENT");
            }
        }

        require(totalAmount <= balances[account], "INSUFFICIENT_BALANCE");

        for (uint256 i = 0; i < recipients.length; i++) {
            bytes32 paymentId = keccak256(abi.encodePacked(batchId, i, recipients[i], amounts[i]));
            _executePayment(paymentId, account, recipients[i], amounts[i]);
        }

        emit BatchExecuted(batchId, account, recipients.length, totalAmount);
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function _depositFor(address account) private {
        require(account != address(0), "ZERO_ACCOUNT");
        require(msg.value > 0, "ZERO_AMOUNT");
        balances[account] += msg.value;
        emit Deposited(account, msg.sender, msg.value);
    }

    function _executePayment(bytes32 paymentId, address account, address payable recipient, uint256 amount) private {
        require(paymentId != bytes32(0), "ZERO_PAYMENT_ID");
        require(account != address(0), "ZERO_ACCOUNT");
        require(!executedPayments[paymentId], "PAYMENT_ALREADY_EXECUTED");
        require(recipient != address(0), "ZERO_RECIPIENT");
        require(amount > 0, "ZERO_AMOUNT");
        if (maxPaymentWei > 0) require(amount <= maxPaymentWei, "MAX_PAYMENT_EXCEEDED");

        _rollDay(account);
        if (dailyLimitWei > 0) require(spentTodayWei[account] + amount <= dailyLimitWei, "DAILY_LIMIT_EXCEEDED");

        executedPayments[paymentId] = true;
        spentTodayWei[account] += amount;
        _debit(account, amount);

        _send(recipient, amount);
        bytes32 decisionId = keccak256(abi.encodePacked("executed", paymentId));
        recordedDecisions[decisionId] = true;
        emit DecisionRecorded(decisionId, paymentId, recipient, amount, 3, bytes32(0), agentId);
        emit PaymentExecuted(paymentId, account, msg.sender, recipient, amount);
    }

    function _debit(address account, uint256 amount) private {
        require(amount > 0, "ZERO_AMOUNT");
        require(amount <= balances[account], "INSUFFICIENT_BALANCE");
        balances[account] -= amount;
    }

    function _send(address payable recipient, uint256 amount) private {
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "TRANSFER_FAILED");
    }

    function _rollDay(address account) private {
        uint256 day = _currentDay();
        if (day != spentDay) {
            spentDay = day;
        }
        if (day != spentDayByAccount[account]) {
            spentDayByAccount[account] = day;
            spentTodayWei[account] = 0;
        }
    }

    function _currentDay() private view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function _recoverSigner(bytes32 hash, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(hash, v, r, s);
    }
}
