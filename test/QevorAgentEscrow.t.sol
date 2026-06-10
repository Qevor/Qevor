// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {QevorAgentEscrow} from "../contracts/QevorAgentEscrow.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
}

contract ReentrantExecutor {
    QevorAgentEscrow private immutable escrow;
    bool public reentrySucceeded;

    constructor(QevorAgentEscrow target) {
        escrow = target;
    }

    function attack() external {
        escrow.executePayment(keccak256("outer-payment"), payable(address(this)), 1 ether);
    }

    receive() external payable {
        (reentrySucceeded,) = address(escrow)
            .call(
                abi.encodeCall(escrow.executePayment, (keccak256("reentrant-payment"), payable(address(this)), 1 ether))
            );
    }
}

contract QevorAgentEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    QevorAgentEscrow private escrow;
    address payable private recipient = payable(address(0xBEEF));

    function setUp() public {
        escrow = new QevorAgentEscrow(address(this), 2 ether, 5 ether);
        vm.deal(address(escrow), 10 ether);
    }

    function testExecutePaymentRecordsReplayProtection() public {
        bytes32 paymentId = keccak256("payment-1");
        uint256 beforeBalance = recipient.balance;

        escrow.executePayment(paymentId, recipient, 1 ether);

        require(recipient.balance == beforeBalance + 1 ether, "recipient not paid");
        require(escrow.executedPayments(paymentId), "payment not recorded");

        (bool replaySucceeded,) =
            address(escrow).call(abi.encodeCall(escrow.executePayment, (paymentId, recipient, 1 ether)));
        require(!replaySucceeded, "replayed payment succeeded");
    }

    function testDuplicateBatchRecipientIsBlocked() public {
        address payable[] memory recipients = new address payable[](2);
        recipients[0] = recipient;
        recipients[1] = recipient;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 0.5 ether;
        amounts[1] = 0.5 ether;

        (bool succeeded,) =
            address(escrow).call(abi.encodeCall(escrow.executeBatch, (keccak256("batch-1"), recipients, amounts)));
        require(!succeeded, "duplicate batch recipient succeeded");
    }

    function testRecordsBlockedDecision() public {
        bytes32 decisionId = keccak256("decision-1");
        escrow.recordDecision(decisionId, keccak256("payment-2"), recipient, 1 ether, 0, keccak256("blocked"));
        require(escrow.recordedDecisions(decisionId), "decision not recorded");
    }

    function testLinksErc8004Identity() public {
        address identityRegistry = address(0x8004);
        escrow.setAgentIdentity(identityRegistry, 42);
        require(escrow.identityRegistry() == identityRegistry, "registry not linked");
        require(escrow.agentId() == 42, "agent id not linked");
    }

    function testBlocksReentrantExecution() public {
        ReentrantExecutor attacker = new ReentrantExecutor(escrow);
        escrow.setExecutor(address(attacker));

        attacker.attack();

        require(!attacker.reentrySucceeded(), "reentrant payment succeeded");
        require(address(attacker).balance == 1 ether, "unexpected attacker balance");
        require(!escrow.executedPayments(keccak256("reentrant-payment")), "reentrant payment recorded");
    }
}
